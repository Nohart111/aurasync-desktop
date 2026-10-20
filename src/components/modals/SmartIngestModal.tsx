'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Search, Globe, Disc, Check, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { Track } from '@/core/types/audio';

function YoutubeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export interface YouTubeResult {
  id: string;
  url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
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
        setErrorMsg('Không tìm thấy kết quả phù hợp. Hãy thử từ khóa khác hoặc dán link trực tiếp.');
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
      if (syncData.tracks && Array.isArray(syncData.tracks) && syncData.tracks.length > 0) {
        setLibrary(syncData.tracks);
        if (confirmedTrack) {
          const found =
            syncData.tracks.find((t: Track) => t.id === confirmedTrack.id) || confirmedTrack;
          setCurrentTrack(found);
          setIsPlaying(true);
        }
        return;
      }
    } catch {
      // Fallback to inserting confirmedTrack directly into current store
    }

    if (confirmedTrack) {
      const exists = library.some((t) => t.id === confirmedTrack.id);
      const updated = exists
        ? library.map((t) => (t.id === confirmedTrack.id ? confirmedTrack : t))
        : [confirmedTrack, ...library];
      setLibrary(updated);
      setCurrentTrack(confirmedTrack);
      setIsPlaying(true);
    }
  };

  const handleIngest = async (item: YouTubeResult) => {
    if (ingestingId) return; // Prevent concurrent overlapping requests from UI
    abortPollRef.current = false;
    setIngestingId(item.id);
    setErrorMsg('');
    setSuccessId(null);
    setTaskStatus('queued');
    setStatusText('Đang chờ: Gửi yêu cầu tới GitHub Actions...');

    try {
      const res = await fetch('/api/tracks/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ingest',
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

      // Case 1: Already in catalog (deduplicated immediately with confirmed streamUrl)
      if (data.status === 'completed' && data.track && data.track.streamUrl) {
        setTaskStatus('completed');
        setStatusText(
          data.duplicate
            ? 'Bài hát đã tồn tại trong thư viện! Đang mở phát ngay...'
            : 'Tải thành công! Đã xác nhận file nhạc trong kho lưu trữ.'
        );
        setSuccessId(item.id);
        await syncConfirmedTrackToStore(data.track);
        setTimeout(() => {
          setIngestingId(null);
          setStatusText('');
          setTaskStatus('idle');
          onClose();
        }, 1200);
        return;
      }

      // Case 2: Dispatched to GitHub Actions (HTTP 202 Accepted)
      const requestId = data.requestId || '';
      const videoId = data.videoId || item.id;
      const startedAt = data.startedAt || new Date().toISOString();

      const maxAttempts = 45; // 45 * 4s = 180 seconds max wait
      let confirmedTrack: Track | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (abortPollRef.current) {
          throw new Error('Đã hủy theo dõi tác vụ.');
        }

        await new Promise((r) => setTimeout(r, 4000));

        if (abortPollRef.current) {
          throw new Error('Đã hủy theo dõi tác vụ.');
        }

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

        if (currentState === 'queued') {
          setStatusText(
            `${statusData.message || 'Đang chờ GitHub Actions khởi tạo runner...'} (${attempt * 4}s)`
          );
        } else if (currentState === 'downloading') {
          setStatusText(
            `${statusData.message || 'Đang tải và lưu nhạc vào GitHub Release...'} (${attempt * 4}s)`
          );
        } else if (currentState === 'completed' && statusData.track && statusData.track.streamUrl) {
          confirmedTrack = statusData.track;
          break;
        } else if (currentState === 'failed') {
          throw new Error(
            statusData.error || 'GitHub Actions workflow thất bại khi tải bài hát này.'
          );
        }
      }

      if (!confirmedTrack) {
        throw new Error(
          'Quá thời gian chờ xác nhận từ GitHub Actions (180s). Vui lòng kiểm tra tab Actions trên GitHub hoặc thử lại.'
        );
      }

      setTaskStatus('completed');
      setStatusText('Thành công! File nhạc đã được lưu và xác nhận trên GitHub.');
      setSuccessId(item.id);
      await syncConfirmedTrackToStore(confirmedTrack);

      setTimeout(() => {
        setIngestingId(null);
        setStatusText('');
        setTaskStatus('idle');
        onClose();
      }, 1500);
    } catch (err: any) {
      setTaskStatus('failed');
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình tải nhạc.');
      setIngestingId(null);
      setStatusText('');
    }
  };

  const formatTime = (sec: number) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getStatusBadgeLabel = (status: IngestTaskStatus) => {
    switch (status) {
      case 'queued':
        return 'ĐANG CHỜ (QUEUED)';
      case 'downloading':
        return 'ĐANG TẢI (DOWNLOADING)';
      case 'completed':
        return 'THÀNH CÔNG (COMPLETED)';
      case 'failed':
        return 'THẤT BẠI (FAILED)';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-amber-500/30 bg-[#121316] p-6 text-amber-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-wider text-amber-400 uppercase font-mono">
                Smart Cloud Ingest // GitHub Actions Pipeline
              </h2>
              <p className="text-xs text-amber-50/60">
                Tìm kiếm bài hát hoặc dán URL YouTube — Tải & lưu trữ qua GitHub Actions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-amber-50/50 hover:bg-amber-500/10 hover:text-amber-400 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên bài hát, nghệ sĩ hoặc dán link YouTube (https://...)"
              className="w-full rounded-lg border border-amber-500/30 bg-black/60 pl-10 pr-4 py-3 text-sm text-amber-50 placeholder-amber-50/30 focus:border-amber-400 focus:outline-none font-mono"
            />
            {isUrl(query) ? (
              <Globe className="absolute left-3.5 top-3.5 h-4 w-4 text-emerald-400" />
            ) : (
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-amber-400/60" />
            )}
          </div>
          <button
            type="submit"
            disabled={searching || !!ingestingId}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-xs font-bold uppercase tracking-wider text-black hover:bg-amber-400 disabled:opacity-50 transition font-mono"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <YoutubeIcon className="h-4 w-4" />}
            {isUrl(query) ? 'Kiểm tra Link' : 'Tìm kiếm'}
          </button>
        </form>

        {/* Status Bar */}
        {statusText && (
          <div className="mt-4 flex flex-col gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 font-mono">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-bold text-amber-400">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                {getStatusBadgeLabel(taskStatus)}
              </span>
              <span className="text-[10px] text-amber-200/70">GitHub Actions Worker</span>
            </div>
            <span className="text-amber-100/90">{statusText}</span>
          </div>
        )}

        {/* Error Bar */}
        {errorMsg && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 font-mono">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Results List */}
        <div className="mt-5 max-h-80 overflow-y-auto space-y-2 pr-1">
          {results.map((item) => {
            const isIngesting = ingestingId === item.id;
            const isDone = successId === item.id;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/15 bg-black/40 p-2.5 hover:border-amber-500/40 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-12 w-16 rounded object-cover border border-amber-500/20 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-amber-100">{item.title}</p>
                    <p className="truncate text-xs text-amber-50/50">
                      {item.artist} • <span className="font-mono">{formatTime(item.duration)}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleIngest(item)}
                  disabled={!!ingestingId}
                  className={`shrink-0 flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition ${
                    isDone
                      ? 'bg-emerald-500 text-black'
                      : isIngesting
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500 hover:text-black'
                  }`}
                >
                  {isDone ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Đã Lưu
                    </>
                  ) : isIngesting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {taskStatus === 'queued' ? 'Đang chờ...' : 'Đang tải...'}
                    </>
                  ) : (
                    <>
                      <Disc className="h-3.5 w-3.5" /> Nạp Cloud
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

// Export both named and default to satisfy both `import SmartIngestModal from ...` and `import { SmartIngestModal } from ...`
export default SmartIngestModal;
