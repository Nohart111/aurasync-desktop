'use client';

import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  X,
  Play,
  ArrowDownToLine,
  Check,
  Loader2,
  Disc3,
  AlertCircle,
} from 'lucide-react';
import { usePlayerStore, Track } from '@/store/usePlayerStore';

interface SmartIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CloudCandidate {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl: string;
  audioUrl: string;
  quality: string;
  source: string;
}

export function SmartIngestModal({ isOpen, onClose }: SmartIngestModalProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [cloudResults, setCloudResults] = useState<CloudCandidate[]>([]);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [ingestStatusText, setIngestStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const { queue, queueItems, playTrackNow, enqueueTrack } = usePlayerStore();
  const vaultTracks: Track[] = useMemo(
    () => (queue && queue.length > 0 ? queue : queueItems) || [],
    [queue, queueItems]
  );

  const existingMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.startsWith('http')) return [];
    return vaultTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [query, vaultTracks]);

  const handleSearchCloud = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/tracks/ingest?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setCloudResults(data.results || []);
      }
    } catch {
      setErrorMessage('Không thể kết nối máy chủ tra cứu.');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePreview = async (item: CloudCandidate) => {
    setErrorMessage('');
    let streamUrl = item.audioUrl;

    if (streamUrl.startsWith('yt:')) {
      setIngestStatusText(`Đang chuẩn bị bản nghe thử...`);
      try {
        const res = await fetch(`/api/tracks/ingest?resolve=${encodeURIComponent(streamUrl)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.streamUrl) streamUrl = data.streamUrl;
        }
      } catch {}
      setIngestStatusText('');
    }

    const previewTrack: Track = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      streamUrl,
      url: streamUrl,
      coverUrl: item.coverUrl,
    };
    playTrackNow(previewTrack);
  };

  const handleIngestToVault = async (item: CloudCandidate) => {
    setIngestingId(item.id);
    setErrorMessage('');
    setProgressPercent(25);
    setIngestStatusText(`Đang đồng bộ "${item.title}" về thư viện...`);

    const timer = setInterval(() => {
      setProgressPercent((prev) => (prev < 88 ? prev + 7 : prev));
    }, 800);

    try {
      const res = await fetch('/api/tracks/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });

      clearInterval(timer);

      if (res.ok) {
        const data = await res.json();
        const savedTrack: Track = data.track;

        setProgressPercent(100);
        setIngestStatusText(`Đã lưu vào thư viện.`);

        enqueueTrack(savedTrack);
        playTrackNow(savedTrack);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aurasound:track-added', { detail: savedTrack }));
        }

        setTimeout(() => {
          setIngestingId(null);
          setProgressPercent(0);
          setIngestStatusText('');
          onClose();
        }, 800);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMessage(errData.error || 'Nguồn âm thanh không phản hồi, vui lòng chọn bản thu khác.');
        setIngestingId(null);
        setProgressPercent(0);
      }
    } catch {
      clearInterval(timer);
      setErrorMessage('Gián đoạn kết nối khi đồng bộ.');
      setIngestingId(null);
      setProgressPercent(0);
    }
  };

  const formatTime = (secs: number) => {
    const s = Math.floor(secs || 210);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#0b0b12] p-6 shadow-2xl overflow-hidden"
          >
            {/* Header tối giản */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div>
                <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
                  Tìm kiếm & Lưu trữ
                </h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Tra cứu bài hát hoặc dán liên kết trực tiếp để lưu vào thư viện cá nhân
                </p>
              </div>

              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Thanh tìm kiếm */}
            <form onSubmit={handleSearchCloud} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tên bài hát, nghệ sĩ hoặc liên kết..."
                  autoFocus
                  className="w-full rounded-xl border border-white/[0.08] bg-[#07070c] pl-9 pr-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-white/20"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="flex items-center gap-2 rounded-xl bg-zinc-200 hover:bg-white px-4 py-2.5 text-xs font-semibold text-zinc-950 transition active:scale-[0.98] disabled:opacity-40 cursor-pointer shrink-0"
              >
                {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Tìm kiếm</span>
              </button>
            </form>

            {/* Thanh tiến trình tĩnh lặng */}
            {ingestingId && (
              <div className="mt-4 space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 shrink-0" />
                    {ingestStatusText}
                  </span>
                  <span className="text-zinc-400 tabular-nums">{progressPercent}%</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-zinc-200 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Lỗi nếu có */}
            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs text-zinc-400">
                <AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Danh sách kết quả */}
            <div className="mt-5 max-h-[360px] overflow-y-auto space-y-5 pr-1">
              {/* 1. Đã có trong thư viện */}
              {existingMatches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                    <span>Trong thư viện ({existingMatches.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {existingMatches.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 transition hover:bg-white/[0.05]"
                      >
                        <div className="flex items-center gap-3 overflow-hidden pr-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] border border-white/10 text-zinc-300">
                            <Disc3 className="h-4 w-4" />
                          </div>
                          <div className="truncate">
                            <p className="truncate text-xs font-medium text-zinc-100">{track.title}</p>
                            <p className="truncate text-[11px] text-zinc-500">
                              {track.artist || 'Nghệ sĩ chưa rõ'} • {formatTime(track.duration || 180)}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            playTrackNow(track);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-[11px] font-medium text-zinc-100 transition cursor-pointer shrink-0"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Phát</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Kết quả trực tuyến */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  <span>Kết quả trực tuyến</span>
                  <span>ARCHIVE / MASTER</span>
                </div>

                {isSearching ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500 mb-2" />
                    <p className="text-xs text-zinc-500">Đang tra cứu dữ liệu âm thanh...</p>
                  </div>
                ) : cloudResults.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/[0.06] py-10 text-center">
                    <p className="text-xs text-zinc-500">
                      {hasSearched
                        ? 'Không tìm thấy bản thu phù hợp.'
                        : 'Nhập tên bài hát hoặc liên kết âm thanh để bắt đầu.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {cloudResults.map((item) => {
                      const isThisIngesting = ingestingId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-[#08080e] p-2.5 transition hover:border-white/15 hover:bg-white/[0.03]"
                        >
                          <div className="flex items-center gap-3 overflow-hidden pr-2">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 flex items-center justify-center">
                              {item.coverUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.coverUrl}
                                  alt={item.title}
                                  className="h-full w-full object-cover opacity-90"
                                />
                              ) : (
                                <Disc3 className="h-4 w-4 text-zinc-500" />
                              )}
                            </div>

                            <div className="truncate">
                              <p className="truncate text-xs font-medium text-zinc-100">
                                {item.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                                <span className="truncate max-w-[180px]">{item.artist}</span>
                                <span>•</span>
                                <span className="font-mono tabular-nums text-zinc-400">
                                  {formatTime(item.duration)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handlePreview(item)}
                              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 cursor-pointer"
                              title="Nghe thử"
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                            </button>

                            <button
                              type="button"
                              disabled={Boolean(ingestingId)}
                              onClick={() => handleIngestToVault(item)}
                              className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-[11px] font-medium text-zinc-200 transition disabled:opacity-40 cursor-pointer"
                            >
                              {isThisIngesting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                              ) : (
                                <ArrowDownToLine className="h-3.5 w-3.5 text-zinc-400" />
                              )}
                              <span>{isThisIngesting ? 'Đang lưu...' : 'Lưu trữ'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default SmartIngestModal;
