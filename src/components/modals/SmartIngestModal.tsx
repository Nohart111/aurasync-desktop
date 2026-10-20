'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  CloudDownload,
  Music,
  Clock,
  CheckCircle2,
  Minimize2,
  Maximize2,
  ListPlus,
  Ban,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { Track } from '@/store/usePlayerStore';

export interface YouTubeResult {
  id: string;
  videoId?: string;
  url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  durationFormatted?: string;
}

export type IngestTaskStatus =
  | 'idle'
  | 'pending'
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface IngestQueueTask {
  key: string;
  item: YouTubeResult;
  status: IngestTaskStatus;
  statusText: string;
  elapsedSec: number;
  requestId?: string;
  runId?: number | string;
  startedAt?: number;
}

export interface SmartIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalizeTitleSlug(text?: string): string {
  return (text || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function syncConfirmedTrackToStore(confirmedTrack?: Track) {
  if (!confirmedTrack) return;

  const store = usePlayerStore.getState();
  const isCurrentlyPlaying = store.isPlaying && Boolean(store.currentTrack);
  const existingLib = store.library || [];
  const existingQueue = store.queue || [];
  const targetSlug = normalizeTitleSlug(confirmedTrack.title);

  const isSameSong = (t: Track) =>
    t.id === confirmedTrack.id ||
    Boolean(confirmedTrack.videoId && t.videoId === confirmedTrack.videoId) ||
    Boolean(targetSlug && normalizeTitleSlug(t.title) === targetSlug);

  // Thay thế bản ghi cũ (nếu có) hoặc thêm vào cuối danh sách để không bao giờ ngắt bài đang phát
  const updatedLib = existingLib.some(isSameSong)
    ? existingLib.map((t) => (isSameSong(t) ? confirmedTrack : t))
    : [...existingLib, confirmedTrack];

  const updatedQueue = existingQueue.some(isSameSong)
    ? existingQueue.map((t) => (isSameSong(t) ? confirmedTrack : t))
    : [...existingQueue, confirmedTrack];

  store.setLibrary(updatedLib);
  store.setQueue(updatedQueue);

  if (!isCurrentlyPlaying && (!store.currentTrack || isSameSong(store.currentTrack))) {
    store.setCurrentTrack(confirmedTrack);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aurasound:track-added', { detail: confirmedTrack }));
  }

  try {
    const syncRes = await fetch(`/api/tracks/search?t=${Date.now()}`, { cache: 'no-store' });
    const syncData = await syncRes.json();
    const tracksList: Track[] = Array.isArray(syncData)
      ? syncData
      : Array.isArray(syncData?.tracks)
      ? syncData.tracks
      : [];

    if (tracksList.length > 0) {
      const mergedLib = [
        ...tracksList.map((t: Track) => (isSameSong(t) ? confirmedTrack : t)),
        ...(!tracksList.some(isSameSong) ? [confirmedTrack] : []),
      ];
      usePlayerStore.getState().setLibrary(mergedLib);
    }
  } catch {}
}

// ============================================================================
// MODULE-LEVEL SINGLETON QUEUE CONTROLLER
// Đảm bảo tiến trình tải ngầm và hàng đợi nhiều bài luôn chạy xuyên suốt
// ngay cả khi người dùng thu nhỏ hoặc đóng/mở lại modal, với Concurrency = 1
// để không bao giờ xung đột Git khi cập nhật catalog.json.
// ============================================================================
interface IngestControllerState {
  tasks: IngestQueueTask[];
  completedKeys: Set<string>;
  lastError: string;
  isWorkerRunning: boolean;
}

const controllerState: IngestControllerState = {
  tasks: [],
  completedKeys: new Set<string>(),
  lastError: '',
  isWorkerRunning: false,
};

let cancelCurrentSleep: (() => void) | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function interruptibleSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cancelCurrentSleep = null;
      resolve();
    }, ms);
    cancelCurrentSleep = () => {
      clearTimeout(timer);
      cancelCurrentSleep = null;
      resolve();
    };
  });
}

export function enqueueIngestTask(item: YouTubeResult) {
  const key = item.videoId || item.id;
  controllerState.lastError = '';

  const existing = controllerState.tasks.find((t) => t.key === key);
  if (
    existing &&
    (existing.status === 'pending' ||
      existing.status === 'queued' ||
      existing.status === 'downloading')
  ) {
    return;
  }

  controllerState.completedKeys.delete(key);
  controllerState.tasks = [
    ...controllerState.tasks.filter((t) => t.key !== key),
    {
      key,
      item,
      status: 'pending',
      statusText: 'Đang nằm trong hàng đợi tải...',
      elapsedSec: 0,
    },
  ];
  notifySubscribers();
  void runSequentialQueueWorker();
}

export function enqueueBatchIngestTasks(items: YouTubeResult[]) {
  for (const item of items) {
    enqueueIngestTask(item);
  }
}

export function cancelIngestTask(key: string) {
  const target = controllerState.tasks.find((t) => t.key === key);
  if (!target) return;

  const wasActive = target.status === 'queued' || target.status === 'downloading';
  const snapshot = { ...target };

  target.status = 'cancelled';
  controllerState.tasks = controllerState.tasks.filter((t) => t.key !== key);
  notifySubscribers();

  if (wasActive) {
    if (cancelCurrentSleep) {
      cancelCurrentSleep();
    }
    void fetch('/api/tracks/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cancel',
        runId: snapshot.runId,
        requestId: snapshot.requestId,
        videoId: snapshot.key,
        title: snapshot.item.title,
        startedAt: snapshot.startedAt,
      }),
    }).catch(() => {});
  }
}

export function cancelAllIngestTasks() {
  const activeTask = controllerState.tasks.find(
    (t) => t.status === 'queued' || t.status === 'downloading'
  );
  // Xóa toàn bộ các bài đang chờ (pending) trước
  controllerState.tasks = controllerState.tasks.filter(
    (t) => t.status === 'queued' || t.status === 'downloading'
  );
  if (activeTask) {
    cancelIngestTask(activeTask.key);
  } else {
    notifySubscribers();
  }
}

async function runSequentialQueueWorker() {
  if (controllerState.isWorkerRunning) return;
  controllerState.isWorkerRunning = true;
  notifySubscribers();

  try {
    while (true) {
      const nextTask = controllerState.tasks.find((t) => t.status === 'pending');
      if (!nextTask) break;

      nextTask.status = 'queued';
      nextTask.statusText = 'Đang gửi yêu cầu khởi tạo tác vụ tới GitHub Actions...';
      nextTask.elapsedSec = 0;
      nextTask.startedAt = Date.now();
      notifySubscribers();

      try {
        const res = await fetch('/api/tracks/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ingest',
            force: true,
            track: {
              id: nextTask.key,
              videoId: nextTask.key,
              url: nextTask.item.url,
              title: nextTask.item.title,
              artist: nextTask.item.artist,
              thumbnail: nextTask.item.thumbnail,
              duration: nextTask.item.duration,
            },
            id: nextTask.key,
            videoId: nextTask.key,
            url: nextTask.item.url,
            title: nextTask.item.title,
            artist: nextTask.item.artist,
            thumbnail: nextTask.item.thumbnail,
            duration: nextTask.item.duration,
          }),
        });

        const data = await res.json().catch(() => ({}));

        // Kiểm tra nếu người dùng đã bấm Hủy trong lúc đang gửi request khởi tạo
        if (
          nextTask.status === ('cancelled' as IngestTaskStatus) ||
          !controllerState.tasks.some((t) => t.key === nextTask.key)
        ) {
          if (data?.requestId || nextTask.startedAt) {
            void fetch('/api/tracks/ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'cancel',
                requestId: data?.requestId,
                videoId: nextTask.key,
                title: nextTask.item.title,
                startedAt: data?.startedAt || nextTask.startedAt,
              }),
            }).catch(() => {});
          }
          continue;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Khởi tạo tiến trình tải nhạc thất bại.');
        }

        if (
          data.status === 'completed' &&
          data.track &&
          (data.track.streamUrl || data.track.cdnUrl)
        ) {
          nextTask.status = 'completed';
          nextTask.statusText = 'Đã lưu bài hát chuẩn MP3 vào kho nhạc!';
          controllerState.completedKeys.add(nextTask.key);
          notifySubscribers();
          await syncConfirmedTrackToStore(data.track);
          await interruptibleSleep(900);
          controllerState.tasks = controllerState.tasks.filter((t) => t.key !== nextTask.key);
          notifySubscribers();
          continue;
        }

        nextTask.requestId = data.requestId || '';
        nextTask.startedAt = data.startedAt || nextTask.startedAt || Date.now();
        notifySubscribers();

        const maxAttempts = 60; // 60 * 2s = 120s max wait
        let confirmedTrack: Track | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          await interruptibleSleep(2000);

          if (
            nextTask.status === ('cancelled' as IngestTaskStatus) ||
            !controllerState.tasks.some((t) => t.key === nextTask.key)
          ) {
            break;
          }

          nextTask.elapsedSec = attempt * 2;
          notifySubscribers();

          const statusRes = await fetch('/api/tracks/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'status',
              requestId: nextTask.requestId,
              videoId: nextTask.key,
              title: nextTask.item.title,
              startedAt: nextTask.startedAt,
            }),
            cache: 'no-store',
          });

          const statusData = await statusRes.json().catch(() => ({}));

          if (
            nextTask.status === ('cancelled' as IngestTaskStatus) ||
            !controllerState.tasks.some((t) => t.key === nextTask.key)
          ) {
            break;
          }

          if (statusData.runId) {
            nextTask.runId = statusData.runId;
          }

          if (!statusRes.ok && statusData.error) {
            throw new Error(statusData.error);
          }

          const currentState: IngestTaskStatus = statusData.status || 'queued';
          if (currentState === 'cancelled') {
            break;
          }

          nextTask.status = currentState;
          const serverMsg = statusData.message || statusData.step;

          if (currentState === 'queued') {
            nextTask.statusText =
              serverMsg || 'Đang chờ máy ảo GitHub Actions tiếp nhận tác vụ...';
          } else if (currentState === 'downloading') {
            nextTask.statusText =
              serverMsg || 'GitHub Actions đang tải âm thanh & chuẩn hóa MP3...';
          } else if (
            currentState === 'completed' &&
            statusData.track &&
            (statusData.track.streamUrl || statusData.track.cdnUrl)
          ) {
            confirmedTrack = statusData.track;
            break;
          } else if (currentState === 'failed') {
            throw new Error(
              statusData.error ||
                'Không thể trích xuất luồng âm thanh của video này. Vui lòng thử video khác.'
            );
          }

          notifySubscribers();
        }

        if (
          nextTask.status === ('cancelled' as IngestTaskStatus) ||
          !controllerState.tasks.some((t) => t.key === nextTask.key)
        ) {
          continue;
        }

        if (!confirmedTrack) {
          throw new Error(
            `Quá thời gian chờ xác nhận (120s) cho bài "${nextTask.item.title}".`
          );
        }

        nextTask.status = 'completed';
        nextTask.statusText = 'Hoàn tất! Đã lưu bài hát chuẩn MP3 vào kho nhạc.';
        controllerState.completedKeys.add(nextTask.key);
        notifySubscribers();

        await syncConfirmedTrackToStore(confirmedTrack);
        await interruptibleSleep(900);

        controllerState.tasks = controllerState.tasks.filter((t) => t.key !== nextTask.key);
        notifySubscribers();
      } catch (err: any) {
        if (
          nextTask.status !== ('cancelled' as IngestTaskStatus) &&
          controllerState.tasks.some((t) => t.key === nextTask.key)
        ) {
          controllerState.lastError =
            err?.message || `Lỗi khi tải bài "${nextTask.item.title}".`;
          controllerState.tasks = controllerState.tasks.filter((t) => t.key !== nextTask.key);
          notifySubscribers();
        }
      }
    }
  } finally {
    controllerState.isWorkerRunning = false;
    notifySubscribers();
  }
}

export function SmartIngestModal({ isOpen, onClose }: SmartIngestModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((n) => n + 1);
    subscribers.add(onUpdate);
    return () => {
      subscribers.delete(onUpdate);
    };
  }, []);

  // Khi người dùng mở lại modal từ thanh công cụ bên ngoài, tự động bỏ thu nhỏ
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
    }
  }, [isOpen]);

  const tasks = controllerState.tasks;
  const activeTask =
    tasks.find(
      (t) => t.status === 'queued' || t.status === 'downloading' || t.status === 'completed'
    ) || tasks[0];
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const hasRunningTasks = tasks.length > 0;
  const combinedError = localError || controllerState.lastError;

  // Khi đang ở chế độ thu nhỏ chạy ngầm và toàn bộ hàng đợi đã tải xong -> tự động đóng gọn
  useEffect(() => {
    if (isMinimized && !hasRunningTasks && isOpen) {
      const timer = setTimeout(() => {
        setIsMinimized(false);
        onClose();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isMinimized, hasRunningTasks, isOpen, onClose]);

  // Nếu modal đang đóng và không có tác vụ chạy ngầm nào -> không hiển thị gì
  if (!isOpen && !hasRunningTasks) return null;

  // ==========================================================================
  // CHẾ ĐỘ CHẠY NGẦM (FLOATING PILL NHỎ GỌN GÓC DƯỚI PHẢI)
  // Hiển thị khi người dùng bấm X / "Chạy ngầm" trong lúc đang tải nhạc.
  // Không có lớp nền đen (backdrop), giúp người dùng nghe nhạc & thao tác tự do!
  // ==========================================================================
  if ((!isOpen || isMinimized) && hasRunningTasks && activeTask) {
    return (
      <div className="fixed bottom-28 right-6 z-50 w-80 overflow-hidden rounded-2xl border border-neon-cyan/35 bg-[#0b0b16]/95 p-3.5 text-white shadow-[0_16px_50px_rgba(0,0,0,0.85)] backdrop-blur-xl select-none font-sans">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {activeTask.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neon-cyan" />
            )}
            <span className="truncate text-xs font-bold text-neon-cyan">
              {activeTask.status === 'completed'
                ? 'Đã lưu vào kho!'
                : `Đang tải ngầm${tasks.length > 1 ? ` (còn ${tasks.length} bài)` : ''}`}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {activeTask.elapsedSec > 0 && activeTask.status !== 'completed' && (
              <span className="mr-1 font-mono text-[10px] text-zinc-400">
                {activeTask.elapsedSec}s
              </span>
            )}
            {isOpen && (
              <button
                onClick={() => setIsMinimized(false)}
                className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
                title="Mở rộng cửa sổ tải nhạc"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => cancelIngestTask(activeTask.key)}
              className="rounded-lg px-2 py-0.5 text-[11px] font-semibold text-rose-400 transition hover:bg-rose-500/20 hover:text-rose-200 cursor-pointer"
              title="Hủy tải bài này"
            >
              Hủy
            </button>
          </div>
        </div>

        <p className="mt-1 truncate text-xs font-medium text-zinc-200">
          {activeTask.item.title}
        </p>

        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-neon-cyan via-sky-400 to-emerald-400 transition-all duration-300 ${
              activeTask.status === 'queued'
                ? 'w-1/3 animate-pulse'
                : activeTask.status === 'downloading'
                ? 'w-3/4 animate-pulse'
                : 'w-full'
            }`}
          />
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  const isUrl = (str: string) => {
    try {
      const u = new URL(str.trim());
      return (
        u.hostname.includes('youtube.com') ||
        u.hostname.includes('youtu.be') ||
        u.hostname.includes('soundcloud.com')
      );
    } catch {
      return false;
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLocalError('');
    controllerState.lastError = '';
    setResults([]);
    setSearching(true);

    try {
      const res = await fetch('/api/tracks/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tìm kiếm nguồn nhạc');

      const items: YouTubeResult[] = data.results || [];
      setResults(items);

      if (items.length === 0) {
        setLocalError(
          'Không tìm thấy kết quả phù hợp. Hãy thử từ khóa khác hoặc dán link YouTube trực tiếp.'
        );
      }
    } catch (err: any) {
      setLocalError(err.message || 'Không thể kết nối máy chủ tìm kiếm.');
    } finally {
      setSearching(false);
    }
  };

  const handleCloseButton = () => {
    // Nếu đang có bài tải dở, nút X sẽ thu nhỏ xuống góc phải để chạy ngầm thay vì làm đứt tiến trình!
    if (hasRunningTasks) {
      setIsMinimized(true);
    } else {
      onClose();
    }
  };

  const formatTime = (sec: number) => {
    if (!sec) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const unqueuedResults = results.filter((r) => {
    const k = r.videoId || r.id;
    return !tasks.some((t) => t.key === k) && !controllerState.completedKeys.has(k);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xl p-4 select-none font-sans">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141424]/95 via-[#0b0b14]/98 to-[#06060b] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.08),transparent_60%)]" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neon-cyan shadow-inner">
              <CloudDownload className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-white">
                  Nạp nhạc từ Cloud
                </h2>
                <span className="rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-neon-cyan">
                  GITHUB CDN
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                Hỗ trợ chọn tải nhiều bài vào hàng đợi & thu nhỏ chạy ngầm khi đang nghe nhạc
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {hasRunningTasks && (
              <button
                onClick={() => setIsMinimized(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-neon-cyan/40 hover:bg-neon-cyan/10 hover:text-neon-cyan cursor-pointer"
                title="Thu nhỏ xuống góc màn hình để vừa tải ngầm vừa nghe nhạc"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Chạy ngầm</span>
              </button>
            )}
            <button
              onClick={handleCloseButton}
              className="rounded-xl border border-transparent p-2 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white cursor-pointer"
              title={hasRunningTasks ? 'Thu nhỏ chạy ngầm' : 'Đóng'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search Input Bar (Luôn mở khóa để tìm bài mới ngay cả khi đang tải ngầm) */}
        <form onSubmit={handleSearch} className="relative z-10 mt-5 flex items-center gap-2.5">
          <div className="relative flex-1">
            {isUrl(query) ? (
              <Globe className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neon-cyan" />
            ) : (
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên bài hát, nghệ sĩ hoặc dán link YouTube..."
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 transition focus:border-neon-cyan/50 focus:bg-white/[0.06] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-xs font-bold text-black shadow-lg transition hover:bg-zinc-200 active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-black" />
                <span>Đang tìm...</span>
              </>
            ) : (
              <span>{isUrl(query) ? 'Kiểm tra' : 'Tìm'}</span>
            )}
          </button>
        </form>

        {/* Active Task & Queue Progress Tracker */}
        {activeTask && (
          <div className="relative z-10 mt-4 overflow-hidden rounded-2xl border border-neon-cyan/30 bg-[#09151d]/90 p-4 shadow-inner">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 font-semibold text-neon-cyan min-w-0">
                {activeTask.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-neon-cyan shrink-0" />
                )}
                <span className="truncate">
                  {activeTask.status === 'queued' && 'ĐANG KHỞI TẠO (QUEUED)'}
                  {activeTask.status === 'downloading' && 'ĐANG TẢI & CHUẨN HÓA MP3'}
                  {activeTask.status === 'completed' && 'THÀNH CÔNG (COMPLETED)'}
                  {activeTask.status === 'pending' && 'ĐANG CHỜ TRONG HÀNG ĐỢI'}
                  {pendingCount > 0 && ` • Còn ${pendingCount} bài chờ kế tiếp`}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeTask.elapsedSec > 0 && activeTask.status !== 'completed' && (
                  <span className="font-mono text-[11px] text-zinc-400">
                    {activeTask.elapsedSec}s
                  </span>
                )}
                {activeTask.status !== 'completed' && (
                  <button
                    onClick={() => cancelIngestTask(activeTask.key)}
                    className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/25 hover:text-white cursor-pointer"
                    title="Hủy tải bài đang chạy"
                  >
                    <Ban className="h-3 w-3" />
                    <span>Hủy bài này</span>
                  </button>
                )}
                {tasks.length > 1 && (
                  <button
                    onClick={cancelAllIngestTasks}
                    className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-200 cursor-pointer"
                    title="Hủy toàn bộ hàng đợi tải"
                  >
                    Hủy tất cả ({tasks.length})
                  </button>
                )}
              </div>
            </div>

            <p className="mt-1.5 truncate text-xs text-zinc-200">
              <span className="font-semibold text-white">{activeTask.item.title}</span> —{' '}
              <span className="text-zinc-400">{activeTask.statusText}</span>
            </p>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-neon-cyan via-sky-400 to-emerald-400 transition-all duration-300 ${
                  activeTask.status === 'queued'
                    ? 'w-1/3 animate-pulse'
                    : activeTask.status === 'downloading'
                    ? 'w-3/4 animate-pulse'
                    : 'w-full'
                }`}
              />
            </div>
          </div>
        )}

        {/* Error Notification */}
        {combinedError && (
          <div className="relative z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span className="truncate">{combinedError}</span>
            </div>
            <button
              onClick={() => {
                setLocalError('');
                controllerState.lastError = '';
                notifySubscribers();
              }}
              className="text-rose-300 hover:text-white text-[11px] shrink-0 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Batch Action Bar (Khi có nhiều kết quả tìm kiếm) */}
        {results.length > 1 && unqueuedResults.length > 1 && (
          <div className="relative z-10 mt-4 flex items-center justify-between px-1">
            <span className="text-[11px] text-zinc-400">
              Bạn có thể bấm chọn tải nhiều bài liên tiếp vào hàng đợi
            </span>
            <button
              onClick={() => enqueueBatchIngestTasks(unqueuedResults)}
              className="flex items-center gap-1.5 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-neon-cyan transition hover:bg-neon-cyan hover:text-black cursor-pointer"
            >
              <ListPlus className="h-3.5 w-3.5" />
              <span>Tải tất cả ({unqueuedResults.length} bài)</span>
            </button>
          </div>
        )}

        {/* Search Results */}
        <div className="relative z-10 mt-3 max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
          {results.length === 0 && !searching && !combinedError && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.01] py-10 text-center">
              <Music className="h-8 w-8 text-zinc-600 mb-2" />
              <p className="text-xs font-medium text-zinc-400">
                Nhập tên bài hát hoặc dán link YouTube để tìm kiếm
              </p>
              <p className="mt-1 text-[11px] text-zinc-600">
                Có thể chọn tải nhiều bài cùng lúc hoặc thu nhỏ cửa sổ để vừa tải ngầm vừa nghe nhạc
              </p>
            </div>
          )}

          {results.map((item) => {
            const itemKey = item.videoId || item.id;
            const queuedTask = tasks.find((t) => t.key === itemKey);
            const queuePosition = tasks.findIndex((t) => t.key === itemKey) + 1;
            const isIngesting =
              queuedTask?.status === 'queued' || queuedTask?.status === 'downloading';
            const isPending = queuedTask?.status === 'pending';
            const isDone =
              queuedTask?.status === 'completed' || controllerState.completedKeys.has(itemKey);

            return (
              <div
                key={itemKey}
                className={`group flex items-center justify-between gap-4 rounded-2xl border p-3 transition-all ${
                  isIngesting
                    ? 'border-neon-cyan/40 bg-neon-cyan/[0.06]'
                    : isPending
                    ? 'border-amber-400/30 bg-amber-400/[0.05]'
                    : isDone
                    ? 'border-emerald-500/40 bg-emerald-500/[0.08]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-200 backdrop-blur-sm">
                      <Clock className="h-2.5 w-2.5 text-neon-cyan" />
                      {item.durationFormatted || formatTime(item.duration)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-white group-hover:text-neon-cyan transition-colors">
                      {item.title}
                    </h4>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      {item.artist || 'Nghệ sĩ chưa rõ'}
                    </p>
                  </div>
                </div>

                {isIngesting || isPending ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                        isIngesting
                          ? 'border border-neon-cyan/40 bg-neon-cyan/15 text-neon-cyan'
                          : 'border border-amber-400/30 bg-amber-400/10 text-amber-300'
                      }`}
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{isIngesting ? 'Đang tải...' : `Chờ #${queuePosition}`}</span>
                    </span>
                    <button
                      onClick={() => cancelIngestTask(itemKey)}
                      className="rounded-xl border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500 hover:text-white cursor-pointer"
                      title="Hủy tải bài này"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => enqueueIngestTask(item)}
                    className={`shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                      isDone
                        ? 'bg-emerald-500 text-black font-bold shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                        : 'border border-white/10 bg-white/[0.07] text-white hover:bg-white hover:text-black active:scale-95'
                    }`}
                  >
                    {isDone ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Đã lưu</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-neon-cyan group-hover:text-black transition-colors" />
                        <span>{hasRunningTasks ? 'Thêm vào Hàng đợi' : 'Tải về Kho'}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SmartIngestModal;
