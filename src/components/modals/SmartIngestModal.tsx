'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  CloudDownload,
  Play,
  AlertCircle,
  Loader2,
  Clock,
  Plus,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';

interface YouTubeResult {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  durationFormatted: string;
  thumbnail: string;
  url: string;
  source: string;
}

interface SmartIngestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmartIngestModal({ isOpen, onClose }: SmartIngestModalProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const store = usePlayerStore() as any;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (ingestingId) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ingestingId]);

  if (!isOpen) return null;

  const queueList: any[] = Array.isArray(store?.queue)
    ? store.queue
    : Array.isArray(store?.queueItems)
    ? store.queueItems
    : [];

  const getExistingTrack = (title: string) => {
    const clean = title.toLowerCase().trim();
    return queueList.find((t: any) => t?.title && t.title.toLowerCase().trim() === clean);
  };

  const triggerPlayTrack = (track: any) => {
    setTimeout(() => {
      if (typeof store?.playTrackNow === 'function') {
        store.playTrackNow(track);
      } else {
        if (typeof store?.enqueueTrack === 'function') store.enqueueTrack(track);
        if (typeof store?.jumpToTrack === 'function') store.jumpToTrack(track.id);
        if (typeof store?.setPlaying === 'function') store.setPlaying(true);
      }
    }, 50);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isSearching || ingestingId) return;

    setIsSearching(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch('/api/tracks/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query: query.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi tìm kiếm.');

      if (data.results && data.results.length > 0) {
        setResults(data.results);
      } else {
        setError('Không tìm thấy kết quả phù hợp.');
      }
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối máy chủ.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleIngest = async (item: YouTubeResult) => {
    if (ingestingId) return;

    setIngestingId(item.id);
    setError(null);

    try {
      const res = await fetch('/api/tracks/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ingest', track: item }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tải bài hát thất bại.');

      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aurasound:track-added', { detail: data.track }));
        }
        triggerPlayTrack(data.track);
        setIngestingId(null);
        onClose();
      }, 100);
    } catch (err: any) {
      setError(err.message || 'Không thể tải bài hát này.');
      setIngestingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={() => !ingestingId && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0b0b10] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CloudDownload className="h-4 w-4 text-zinc-300" />
            <h2 className="text-sm font-medium text-zinc-100">Tải nhạc từ YouTube</h2>
          </div>
          <button
            onClick={onClose}
            disabled={!!ingestingId}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 pb-3">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm bài hát, nghệ sĩ hoặc dán link YouTube..."
                disabled={isSearching || !!ingestingId}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !query.trim() || !!ingestingId}
              className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition-all disabled:opacity-40 flex items-center gap-1.5 shrink-0"
            >
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>Tìm</span>}
            </button>
          </form>

          {ingestingId && (
            <div className="mt-3 px-3.5 py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center justify-between text-xs text-zinc-300 mb-1.5">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  Đang tải và đồng bộ...
                </span>
                <span className="font-mono text-[11px] text-zinc-400">{elapsedSeconds}s</span>
              </div>
              <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-zinc-200 transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(95, Math.max(12, elapsedSeconds * 8))}%` }}
                />
              </div>
            </div>
          )}

          {error && !ingestingId && (
            <div className="mt-3 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-red-900/40 bg-red-950/20 text-red-300 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {results.map((item) => {
            const existing = getExistingTrack(item.title);
            const isCurrentIngesting = ingestingId === item.id;

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-zinc-800/70 bg-zinc-900/30 hover:bg-zinc-900/70 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-11 w-11 shrink-0 rounded-lg object-cover bg-zinc-800 border border-zinc-800"
                    crossOrigin="anonymous"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-medium text-zinc-100 truncate">{item.title}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                      <span className="truncate max-w-[170px]">{item.artist}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-mono text-[10px]">
                        <Clock className="h-2.5 w-2.5" />
                        {item.durationFormatted}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {existing ? (
                    <button
                      onClick={() => {
                        triggerPlayTrack(existing);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 hover:text-white text-xs transition-all"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>Phát</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleIngest(item)}
                      disabled={!!ingestingId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs transition-all disabled:opacity-40"
                    >
                      {isCurrentIngesting ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Đang tải</span>
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          <span>Tải lên</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {!isSearching && results.length === 0 && !error && (
            <div className="py-10 text-center text-xs text-zinc-500">
              Nhập tên bài hát hoặc dán link YouTube để thêm vào thư viện.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SmartIngestModal;
