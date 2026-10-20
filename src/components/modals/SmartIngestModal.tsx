'use client';

import React, { useState, useRef, useEffect } from 'react';
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

export type IngestTaskStatus = 'idle' | 'queued' | 'downloading' | 'completed' | 'failed';

export interface SmartIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmartIngestModal({ isOpen, onClose }: SmartIngestModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<IngestTaskStatus>('idle');
  const [statusText, setStatusText] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [successId, setSuccessId] = useState<string | null>(null);

  const { setLibrary, library, setCurrentTrack, setIsPlaying } = usePlayerStore();
  const abortPollRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      abortPollRef.current = true;
    } else {
      abortPollRef.current = false;
    }
    return () => {
      abortPollRef.current = true;
    };
  }, [isOpen]);

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

    setErrorMsg('');
    setResults([]);
    setSearching(true);
    setTaskStatus('idle');
    setStatusText('');

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
        setErrorMsg('Không tìm thấy kết quả phù hợp. Hãy thử từ khóa khác hoặc dán link YouTube trực tiếp.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể kết nối máy chủ tìm kiếm.');
    } finally {
      setSearching(false);
    }
  };

  const syncConfirmedTrackToStore = async (confirmedTrack?: Track) => {
    try {
      const syncRes = await fetch(`/api/tracks/search?t=${Date.now()}`, { cache: 'no-store' });
      const syncData = await syncRes.json();
      const tracksList: Track[] = Array.isArray(syncData)
        ? syncData
        : Array.isArray(syncData?.tracks)
        ? syncData.tracks
        : [];

      if (tracksList.length > 0) {
        setLibrary(tracksList);
        const target = confirmedTrack
          ? tracksList.find((t: Track) => t.id === confirmedTrack.id) || confirmedTrack
          : tracksList[0];

        if (target) {
          setCurrentTrack(target);
          setIsPlaying(true);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aurasound:track-added', { detail: target }));
          }
        }
        return;
      }
    } catch {}

    if (confirmedTrack) {
      const exists = library.some((t) => t.id === confirmedTrack.id);
      const updated = exists
        ? library.map((t) => (t.id === confirmedTrack.id ? confirmedTrack : t))
        : [confirmedTrack, ...library];
      setLibrary(updated);
      setCurrentTrack(confirmedTrack);
      setIsPlaying(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aurasound:track-added', { detail: confirmedTrack }));
      }
    }
  };

  const handleIngest = async (item: YouTubeResult) => {
    if (ingestingId) return;
    abortPollRef.current = false;
    const itemKey = item.videoId || item.id;
    setIngestingId(itemKey);
    setErrorMsg('');
    setSuccessId(null);
    setElapsedSec(0);
    setTaskStatus('queued');
    setStatusText('Đang gửi yêu cầu khởi tạo tác vụ tới GitHub Actions...');

    try {
      const res = await fetch('/api/tracks/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ingest',
          track: {
            id: itemKey,
            videoId: itemKey,
            url: item.url,
            title: item.title,
            artist: item.artist,
            thumbnail: item.thumbnail,
            duration: item.duration,
          },
          id: itemKey,
          videoId: itemKey,
          url: item.url,
          title: item.title,
          artist: item.artist,
          thumbnail: item.thumbnail,
          duration: item.duration,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Khởi tạo tiến trình tải nhạc thất bại.');
      }

      // Case 1: Bài hát đã tồn tại sẵn trong kho
      if (data.status === 'completed' && data.track && (data.track.streamUrl || data.track.cdnUrl)) {
        setTaskStatus('completed');
        setStatusText(
          data.duplicate || data.alreadyExists
            ? 'Bài hát đã có sẵn trong kho lưu trữ! Đang phát ngay...'
            : 'Đã xác nhận file nhạc trong kho lưu trữ!'
        );
        setSuccessId(itemKey);
        await syncConfirmedTrackToStore(data.track);
        setTimeout(() => {
          setIngestingId(null);
          setStatusText('');
          setTaskStatus('idle');
          onClose();
        }, 1200);
        return;
      }

      // Case 2: Tác vụ được chuyển sang GitHub Actions (HTTP 202 Accepted)
      const requestId = data.requestId || '';
      const videoId = data.videoId || itemKey;
      const startedAt = data.startedAt || Date.now();

      const maxAttempts = 45; // 45 * 4s = 180s
      let confirmedTrack: Track | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (abortPollRef.current) {
          throw new Error('Đã hủy theo dõi tác vụ tải nhạc.');
        }

        await new Promise((r) => setTimeout(r, 4000));

        if (abortPollRef.current) {
          throw new Error('Đã hủy theo dõi tác vụ tải nhạc.');
        }

        setElapsedSec(attempt * 4);

        const statusRes = await fetch('/api/tracks/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'status',
            requestId,
            videoId,
            title: item.title,
            startedAt,
          }),
          cache: 'no-store',
        });

        const statusData = await statusRes.json().catch(() => ({}));

        if (!statusRes.ok && statusData.error) {
          throw new Error(statusData.error);
        }

        const currentState: IngestTaskStatus = statusData.status || 'queued';
        setTaskStatus(currentState);

        const serverMsg = statusData.message || statusData.step;
        if (currentState === 'queued') {
          setStatusText(serverMsg || 'Đang chờ máy ảo GitHub Actions tiếp nhận tác vụ...');
        } else if (currentState === 'downloading') {
          setStatusText(serverMsg || 'GitHub Actions đang tải âm thanh & đồng bộ vào Release...');
        } else if (
          currentState === 'completed' &&
          statusData.track &&
          (statusData.track.streamUrl || statusData.track.cdnUrl)
        ) {
          confirmedTrack = statusData.track;
          break;
        } else if (currentState === 'failed') {
          throw new Error(
            statusData.error || 'Không thể trích xuất luồng âm thanh của video này. Vui lòng thử video khác.'
          );
        }
      }

      if (!confirmedTrack) {
        throw new Error(
          'Quá thời gian chờ xác nhận từ GitHub Actions (180s). Vui lòng kiểm tra tab Actions trên GitHub hoặc thử lại.'
        );
      }

      setTaskStatus('completed');
      setStatusText('Hoàn tất! File nhạc đã được lưu vào GitHub Release và đồng bộ về thư viện.');
      setSuccessId(itemKey);
      await syncConfirmedTrackToStore(confirmedTrack);

      setTimeout(() => {
        setIngestingId(null);
        setStatusText('');
        setTaskStatus('idle');
        onClose();
      }, 1400);
    } catch (err: any) {
      setTaskStatus('failed');
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình tải nhạc.');
      setIngestingId(null);
      setStatusText('');
    }
  };

  const formatTime = (sec: number) => {
    if (!sec) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xl p-4 select-none font-sans">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141424]/95 via-[#0b0b14]/98 to-[#06060b] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
        {/* Hiệu ứng ánh sáng viền trên chuẩn Studio Deck */}
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
                Tìm kiếm bài hát hoặc dán link YouTube để tải & lưu trữ vĩnh viễn qua GitHub Actions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-transparent p-2 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Input Bar */}
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
            disabled={searching || !!ingestingId}
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

        {/* Task Progress Tracker (Queued -> Downloading -> Completed) */}
        {statusText && (
          <div className="relative z-10 mt-4 overflow-hidden rounded-2xl border border-neon-cyan/30 bg-[#09151d]/90 p-4 shadow-inner">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 font-semibold text-neon-cyan">
                {taskStatus === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-neon-cyan shrink-0" />
                )}
                <span>
                  {taskStatus === 'queued' && 'ĐANG CHỜ (QUEUED)'}
                  {taskStatus === 'downloading' && 'ĐANG TẢI & ĐỒNG BỘ (DOWNLOADING)'}
                  {taskStatus === 'completed' && 'THÀNH CÔNG (COMPLETED)'}
                </span>
              </div>
              {elapsedSec > 0 && taskStatus !== 'completed' && (
                <span className="font-mono text-[11px] text-zinc-400">{elapsedSec}s</span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-zinc-300">{statusText}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-neon-cyan via-sky-400 to-emerald-400 transition-all duration-500 ${
                  taskStatus === 'queued'
                    ? 'w-1/3 animate-pulse'
                    : taskStatus === 'downloading'
                    ? 'w-3/4 animate-pulse'
                    : 'w-full'
                }`}
              />
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="relative z-10 mt-4 flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Search Results */}
        <div className="relative z-10 mt-5 max-h-[340px] space-y-2.5 overflow-y-auto pr-1">
          {results.length === 0 && !searching && !errorMsg && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.01] py-10 text-center">
              <Music className="h-8 w-8 text-zinc-600 mb-2" />
              <p className="text-xs font-medium text-zinc-400">
                Nhập tên bài hát hoặc dán link YouTube để tìm kiếm
              </p>
              <p className="mt-1 text-[11px] text-zinc-600">
                Nhạc được tải qua GitHub Actions và lưu vĩnh viễn trên GitHub Release CDN
              </p>
            </div>
          )}

          {results.map((item) => {
            const itemKey = item.videoId || item.id;
            const isIngesting = ingestingId === itemKey;
            const isDone = successId === itemKey;

            return (
              <div
                key={itemKey}
                className={`group flex items-center justify-between gap-4 rounded-2xl border p-3 transition-all ${
                  isIngesting
                    ? 'border-neon-cyan/40 bg-neon-cyan/[0.06]'
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

                <button
                  onClick={() => handleIngest(item)}
                  disabled={!!ingestingId}
                  className={`shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                    isDone
                      ? 'bg-emerald-500 text-black font-bold shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                      : isIngesting
                      ? 'border border-neon-cyan/40 bg-neon-cyan/15 text-neon-cyan'
                      : 'border border-white/10 bg-white/[0.07] text-white hover:bg-white hover:text-black active:scale-95 disabled:opacity-40'
                  }`}
                >
                  {isDone ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Đã lưu</span>
                    </>
                  ) : isIngesting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{taskStatus === 'queued' ? 'Đang chờ...' : 'Đang tải...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-neon-cyan group-hover:text-black transition-colors" />
                      <span>Tải về Kho</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SmartIngestModal;
