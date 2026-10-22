'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Compass,
  CloudDownload,
  Check,
  Loader2,
  Sparkles,
  Volume2,
  Headphones,
  ChevronDown,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { playYouTubePreview } from '@/components/player/YouTubePreviewBridge';
import {
  enqueueIngestTask,
  cancelIngestTask,
  getIngestControllerSnapshot,
  subscribeIngestController,
  type YouTubeResult,
} from '@/components/modals/SmartIngestModal';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

export interface TrendingCategory {
  id: 'trending' | 'vpop' | 'rap' | 'indie' | 'usuk';
  label: string;
}

export const TRENDING_CATEGORIES: TrendingCategory[] = [
  { id: 'trending', label: 'Thịnh hành' },
  { id: 'vpop', label: 'V-Pop' },
  { id: 'rap', label: 'Rap Việt' },
  { id: 'indie', label: 'Indie / Chill' },
  { id: 'usuk', label: 'US-UK' },
];

const clientTrendingCache = new Map<string, YouTubeResult[]>();

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

export function ExploreTrendingSection() {
  const [activeCategory, setActiveCategory] = useState<TrendingCategory['id']>('trending');
  const [items, setItems] = useState<YouTubeResult[]>(
    () => clientTrendingCache.get('trending') || []
  );
  const [visibleCount, setVisibleCount] = useState<number>(16);
  const [loading, setLoading] = useState<boolean>(!clientTrendingCache.has('trending'));
  const [, setQueueTick] = useState(0);

  const { currentTrack, isPlaying, library, streamCounts } = usePlayerStore();

  useEffect(() => {
    return subscribeIngestController(() => {
      setQueueTick((n) => n + 1);
    });
  }, []);

  const loadCategory = useCallback(async (cat: TrendingCategory['id']) => {
    setVisibleCount(16);
    const cached = clientTrendingCache.get(cat);
    if (cached && cached.length > 0) {
      setItems(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/tracks/trending?category=${cat}`);
      const data = await res.json();
      const list: YouTubeResult[] = Array.isArray(data?.results) ? data.results : [];
      if (list.length > 0) {
        clientTrendingCache.set(cat, list);
      }
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategory(activeCategory);
  }, [activeCategory, loadCategory]);

  const queueSnapshot = getIngestControllerSnapshot();
  const activeQueueTasks = queueSnapshot.tasks;

  const isSavedInVault = (item: YouTubeResult): boolean => {
    const key = item.videoId || item.id;
    if (queueSnapshot.completedKeys.has(key)) return true;
    const itemSlug = normalizeTitleSlug(item.title);
    return (library || []).some(
      (t) =>
        t.id === key ||
        (t.videoId && t.videoId === key) ||
        (itemSlug && normalizeTitleSlug(t.title) === itemSlug)
    );
  };

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <div className="space-y-5 select-none font-sans">
      {/* Thanh lọc Thể loại tối giản (Minimalist Pill Tabs) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3.5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {TRENDING_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  playMechanicalSound('switch');
                  setActiveCategory(cat.id);
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-white text-black shadow-md shadow-white/10 font-bold'
                    : 'border border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
          <Volume2 className="h-3.5 w-3.5 text-amber-400" />
          <span>Chạm vào bài hát để nghe thử ngay (~1s)</span>
        </span>
      </div>

      {/* Danh sách bài hát Thịnh hành */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-2xl border border-white/[0.05] bg-[#0c0c16]/50 p-3 sm:p-3.5 animate-pulse"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="h-12 w-12 rounded-xl bg-white/[0.06] shrink-0" />
                <div className="space-y-2 flex-1 max-w-[220px]">
                  <div className="h-3.5 w-full rounded bg-white/[0.08]" />
                  <div className="h-2.5 w-2/3 rounded bg-white/[0.05]" />
                </div>
              </div>
              <div className="h-8 w-20 rounded-xl bg-white/[0.06]" />
            </div>
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-6 text-center font-mono">
          <Compass className="mb-2 h-8 w-8 text-zinc-600" />
          <p className="text-sm text-zinc-400">ĐANG CẬP NHẬT DANH MỤC THỊNH HÀNH</p>
          <p className="mt-1 text-xs text-zinc-600">
            Vui lòng chọn thể loại khác hoặc thử lại sau giây lát.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
            {visibleItems.map((item, idx) => {
              const key = item.videoId || item.id;
              const isPreviewingThis =
                Boolean(currentTrack?.isPreview) &&
                (currentTrack?.videoId === key || currentTrack?.id === `preview-${key}`);
              const isPlayingThisPreview = isPreviewingThis && isPlaying;

              const saved = isSavedInVault(item);
              const queuedTask = activeQueueTasks.find((t) => t.key === key);
              const queueIndex = activeQueueTasks.findIndex((t) => t.key === key) + 1;
              const isDownloading =
                queuedTask?.status === 'queued' || queuedTask?.status === 'downloading';
              const isPending = queuedTask?.status === 'pending';

              const personalPlays = streamCounts?.[key] || 0;
              const baseStreamLabel = (item as any).viewCountText || '350K+ streams';

              return (
                <div
                  key={key}
                  onClick={() => {
                    playMechanicalSound('toggle');
                    playYouTubePreview(item);
                  }}
                  className={`group relative flex items-center justify-between gap-3 rounded-2xl p-3 sm:p-3.5 transition-all duration-200 cursor-pointer border ${
                    isPreviewingThis
                      ? 'border-white/25 bg-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.6)]'
                      : 'border-white/[0.06] bg-[#0c0c16]/70 hover:border-white/15 hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Cụm Trái: Thứ hạng + Ảnh bìa vuông + Tên bài hát & Nghệ sĩ */}
                  <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                    <span
                      className={`font-mono text-xs font-bold w-5 text-center shrink-0 ${
                        idx < 3 ? 'text-amber-400' : 'text-zinc-500'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>

                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-md">
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      {isPlayingThisPreview && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-blur-[1.5px]">
                          <span className="eq-bars text-amber-400 scale-125">
                            <span /><span /><span />
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="truncate min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={`truncate text-xs sm:text-sm font-semibold transition ${
                            isPreviewingThis
                              ? 'text-white font-bold'
                              : 'text-zinc-100 group-hover:text-white'
                          }`}
                        >
                          {item.title}
                        </p>
                        {isPreviewingThis && (
                          <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 border border-amber-400/40">
                            {isPlayingThisPreview ? 'NGHE THỬ' : 'TẠM DỪNG'}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] sm:text-xs font-mono text-zinc-400">
                        <span className="truncate">{item.artist || 'Nghệ sĩ chưa rõ'}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="shrink-0 inline-flex items-center gap-1 text-zinc-500">
                          <Headphones className="h-3 w-3 text-zinc-500" />
                          <span>
                            {baseStreamLabel}
                            {personalPlays > 0 ? ` (+${personalPlays})` : ''}
                          </span>
                        </span>
                        <span className="hidden sm:inline text-zinc-600">•</span>
                        <span className="hidden sm:inline shrink-0 text-zinc-500 tabular-nums">
                          {item.durationFormatted || '04:00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cụm Phải: Duy nhất 1 nút hành động thông minh ("Lưu kho" / "Đang tải" / "Đã lưu") */}
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {saved ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        <span>Đã lưu</span>
                      </span>
                    ) : isDownloading || isPending ? (
                      <button
                        onClick={() => {
                          playMechanicalSound('toggle');
                          cancelIngestTask(key);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-rose-500/40 hover:bg-rose-500/20 hover:text-rose-200 active:scale-95 cursor-pointer"
                        title="Bấm để hủy tải"
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{isDownloading ? 'Đang tải...' : `Chờ #${queueIndex}`}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          playMechanicalSound('beep');
                          enqueueIngestTask(item);
                        }}
                        className="btn-cyberdeck inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:border-white/30 hover:bg-white hover:text-black active:scale-95 cursor-pointer"
                        title="Lưu bài hát này vào kho lưu trữ cá nhân"
                      >
                        <CloudDownload className="h-3.5 w-3.5 text-zinc-300 group-hover:text-black" />
                        <span>Lưu kho</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nút Xem thêm (Load More 0ms từ bộ nhớ cache) */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => {
                  playMechanicalSound('switch');
                  setVisibleCount((prev) => prev + 16);
                }}
                className="btn-cyberdeck flex items-center gap-2 rounded-2xl px-6 py-2.5 text-xs font-semibold text-zinc-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-95 cursor-pointer"
              >
                <ChevronDown className="h-4 w-4 text-zinc-300" />
                <span>Xem thêm bài hát ({items.length - visibleCount} bài)</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <div className="space-y-6 sm:space-y-8 pb-40 md:pb-24 select-none font-sans relative overflow-x-hidden">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#121222]/85 via-[#090912]/90 to-[#050508] p-4 sm:p-6 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.07),transparent_60%)]" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 tracking-wider uppercase">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>TRENDING_RADAR // INSTANT PREVIEW</span>
            </div>
            <h1 className="mt-1 font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Khám phá Thịnh hành
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400">
              Chạm vào bất kỳ bài hát nào để nghe thử ngay lập tức (~1s), bấm Lưu kho để tải ngầm về thư viện
            </p>
          </div>
        </div>
      </section>

      <ExploreTrendingSection />
    </div>
  );
}
