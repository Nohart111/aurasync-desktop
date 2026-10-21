'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Music,
  ListMusic,
  X,
  Trash2,
  Compass,
  Library,
  CloudDownload,
  Radio,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

import * as MagneticSeekbarModule from '@/components/player/MagneticSeekbar';
const MagneticSeekbar =
  (MagneticSeekbarModule as any).MagneticSeekbar ||
  (MagneticSeekbarModule as any).default ||
  MagneticSeekbarModule;

// ========================================================
// 🌊 BIỂU ĐỒ SÓNG NHẠC 60FPS REAL-TIME CANVAS (TÍM -> CYAN)
// Tự động ngắt vòng lặp RAF khi màn hình tắt (document.hidden) để tiết kiệm pin
// ========================================================
function DynamicSpectrumCanvas({ isPlaying }: { isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array>(new Uint8Array(64));
  const smoothedHeights = useRef<number[]>(new Array(16).fill(2));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;

    const render = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        rafRef.current = null;
        return;
      }

      phase += 0.08;
      let hasData = false;

      if (typeof window !== 'undefined' && (window as any).__AURASOUND_ANALYSER__) {
        try {
          (window as any).__AURASOUND_ANALYSER__.getByteFrequencyData(dataArrayRef.current);
          const data = dataArrayRef.current;
          let sum = 0;
          for (let i = 0; i < 20; i++) sum += data[i];
          if (sum > 8) hasData = true;
        } catch {}
      }

      const numBars = 16;
      const barWidth = 3;
      const barGap = 3;
      const maxHeight = canvas.height - 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < numBars; i++) {
        let targetHeight = 2;

        if (isPlaying) {
          if (hasData) {
            const sampleIdx = Math.min(63, Math.floor(i * 2 + 1));
            const val = dataArrayRef.current[sampleIdx] || 0;
            const norm = Math.max(0, val - 30) / 180;
            targetHeight = Math.max(2, Math.min(maxHeight, Math.pow(norm, 1.3) * maxHeight));
          } else {
            const wave = Math.sin(phase * 1.4 + i * 0.45) * 0.5 + 0.5;
            targetHeight = Math.max(2, wave * maxHeight * 0.85);
          }
        }

        if (targetHeight > smoothedHeights.current[i]) {
          smoothedHeights.current[i] += (targetHeight - smoothedHeights.current[i]) * 0.45;
        } else {
          smoothedHeights.current[i] = Math.max(2, smoothedHeights.current[i] * 0.82 - 0.2);
        }

        const h = Math.round(smoothedHeights.current[i]);
        const x = i * (barWidth + barGap);
        const y = canvas.height - h;

        const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
        grad.addColorStop(0, '#c084fc');
        grad.addColorStop(0.5, '#06b6d4');
        grad.addColorStop(1, '#00F0FF');

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, h, 1.5);
        } else {
          ctx.rect(x, y, barWidth, h);
        }
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(render);
      }
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={94}
      height={26}
      className="opacity-95 pointer-events-none select-none shrink-0"
    />
  );
}

export function FloatingPlayerBar() {
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const {
    currentTrack,
    isPlaying,
    volume,
    queue,
    queueItems,
    isSidebarCollapsed,
    setVolume,
  } = usePlayerStore();

  const { progressMV, currentTimeMV, actualDuration, seekTo } = useAudioPlayer();

  const handleTogglePlay = () => {
    const store = usePlayerStore.getState() as any;
    if (typeof store.togglePlay === 'function') {
      store.togglePlay();
    } else if (typeof store.setPlaying === 'function') {
      store.setPlaying(!isPlaying);
    } else if (typeof store.setIsPlaying === 'function') {
      store.setIsPlaying(!isPlaying);
    }
  };

  const handleNext = () => {
    usePlayerStore.getState().advanceNext();
  };

  const handlePrev = () => {
    usePlayerStore.getState().advancePrev();
  };

  const queueList = queue || queueItems || [];
  const queueCount = queueList.length;

  return (
    <>
      {/* 1. THANH ĐIỀU HƯỚNG ĐÁY DÀNH RIÊNG CHO MOBILE (< 768px) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden h-14 items-center justify-around border-t border-white/[0.08] bg-[#080811]/95 px-2 backdrop-blur-2xl select-none font-sans">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'vault' }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex flex-col items-center justify-center gap-1 px-2.5 py-1 text-zinc-300 transition hover:text-white active:scale-95"
        >
          <Radio className="h-4 w-4 text-neon-cyan" />
          <span className="text-[10px] font-medium">Đầu Deck</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'explore' }));
            const el = document.getElementById('catalog-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="flex flex-col items-center justify-center gap-1 px-2.5 py-1 text-neon-cyan transition active:scale-95"
        >
          <Compass className="h-4 w-4" />
          <span className="text-[10px] font-semibold">Khám phá</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'vault' }));
            const el = document.getElementById('catalog-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="flex flex-col items-center justify-center gap-1 px-2.5 py-1 text-zinc-400 transition hover:text-white active:scale-95"
        >
          <Library className="h-4 w-4" />
          <span className="text-[10px] font-medium">Kho nhạc</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:open-ingest-modal'));
          }}
          className="flex flex-col items-center justify-center gap-1 px-2.5 py-1 text-zinc-300 transition hover:text-neon-cyan active:scale-95"
        >
          <CloudDownload className="h-4 w-4 text-neon-cyan" />
          <span className="text-[10px] font-semibold text-white">Nạp nhạc</span>
        </button>
      </nav>

      {/* 2. NGĂN KÉO QUEUE TRƯỢT TỪ CẠNH PHẢI KHI BẤM NÚT */}
      <AnimatePresence>
        {isQueueOpen && (
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed left-3 right-3 sm:left-auto sm:right-4 top-4 bottom-36 md:bottom-28 z-50 flex w-auto sm:w-96 flex-col rounded-2xl border border-white/10 bg-[#0c0c16]/95 p-4 sm:p-5 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <ListMusic className="h-5 w-5 text-neon-cyan" />
                <h3 className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
                  HÀNG ĐỢI PHÁT ({queueCount})
                </h3>
              </div>
              <button
                onClick={() => setIsQueueOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                title="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {queueList.length === 0 ? (
                <p className="mt-12 text-center text-xs font-mono text-zinc-500">
                  Hàng đợi trống
                </p>
              ) : (
                queueList.map((track, i) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id || i}
                      onClick={() => {
                        usePlayerStore.getState().playTrackNow(track);
                      }}
                      className={`group flex cursor-pointer items-center justify-between rounded-xl p-2.5 transition ${
                        isCurrent
                          ? 'bg-neon-cyan/15 border border-neon-cyan/40 text-neon-cyan shadow-sm'
                          : 'hover:bg-white/5 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden pr-2">
                        <span className="font-mono text-[10px] text-zinc-500 w-4 text-right shrink-0">
                          {i + 1}
                        </span>
                        <div className="truncate">
                          <p
                            className={`truncate text-xs font-semibold ${
                              isCurrent ? 'text-neon-cyan' : 'text-zinc-100'
                            }`}
                          >
                            {track.title}
                          </p>
                          <p className="truncate text-[10px] text-zinc-400">
                            {track.artist || 'Nghệ sĩ chưa rõ'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isCurrent && (
                          <span className="text-[9px] font-mono font-bold bg-neon-cyan/20 text-neon-cyan px-1.5 py-0.5 rounded">
                            PLAYING
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            usePlayerStore.getState().removeTrackFromQueue(track.id);
                          }}
                          className="p-1 text-zinc-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-rose-400 transition"
                          title="Xóa khỏi hàng đợi"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* 3. THANH DOCK PHÁT NHẠC (RESPONSIVE MOBILE & NGUYÊN BẢN DESKTOP) */}
      {currentTrack && (
        <div
          className={`fixed bottom-[3.75rem] md:bottom-4 left-2.5 right-2.5 z-40 transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'md:left-[5.5rem] md:right-4' : 'md:left-[17rem] md:right-4'
          }`}
        >
          <div className="bg-[#0a0a14]/95 border border-white/[0.08] rounded-2xl p-2.5 px-3.5 md:p-3 md:px-5 shadow-2xl backdrop-blur-xl flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-4">
            {/* Hàng trên trên Mobile / Cụm trái + Nút điều khiển */}
            <div className="flex items-center justify-between gap-2.5 md:contents">
              {/* Cụm trái: Bìa vuông icon Music & Tên bài hát */}
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 max-w-[165px] sm:max-w-[220px] md:max-w-[260px] md:min-w-[200px]">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl border border-white/10 bg-[#0d0d17] flex items-center justify-center shrink-0 shadow-md overflow-hidden">
                  {currentTrack.coverUrl || currentTrack.thumbnail ? (
                    <img
                      src={currentTrack.coverUrl || currentTrack.thumbnail}
                      alt={currentTrack.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Music className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                      {currentTrack.title}
                    </h4>
                    {currentTrack.isPreview && (
                      <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 border border-amber-400/40">
                        PREVIEW
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5">
                    {currentTrack.artist || 'Nghệ sĩ chưa rõ'}
                  </p>
                </div>
              </div>

              {/* Nút điều khiển trên Mobile (< 768px) */}
              <div className="flex md:hidden items-center gap-2.5 shrink-0">
                <button
                  onClick={handlePrev}
                  className="p-1.5 text-zinc-300 hover:text-white transition active:scale-90"
                  title="Bài trước"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  onClick={handleTogglePlay}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-lg transition active:scale-95"
                  title={isPlaying ? 'Tạm dừng' : 'Phát'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black ml-0.5" />
                  )}
                </button>
                <button
                  onClick={handleNext}
                  className="p-1.5 text-zinc-300 hover:text-white transition active:scale-90"
                  title="Bài kế tiếp"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsQueueOpen(!isQueueOpen)}
                  className="relative flex items-center p-1.5 text-zinc-400 hover:text-white transition active:scale-95"
                  title="Danh sách hàng đợi phát"
                >
                  <ListMusic
                    className={`w-4 h-4 transition-colors ${
                      isQueueOpen ? 'text-neon-cyan' : 'hover:text-white'
                    }`}
                  />
                  {queueCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 text-[9px] font-mono font-bold text-neon-cyan select-none">
                      {queueCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Cụm giữa: Nút điều khiển (Desktop) & Thanh Seekbar */}
            <div className="w-full md:flex-1 flex flex-col items-center justify-center md:max-w-xl md:px-2">
              <div className="hidden md:flex items-center gap-5 mb-1.5">
                <button
                  onClick={handlePrev}
                  className="text-zinc-400 hover:text-white transition active:scale-90"
                  title="Bài trước"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={handleTogglePlay}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg transition hover:scale-105 active:scale-95"
                  title={isPlaying ? 'Tạm dừng' : 'Phát'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-black" />
                  ) : (
                    <Play className="w-5 h-5 fill-black ml-0.5" />
                  )}
                </button>
                <button
                  onClick={handleNext}
                  className="text-zinc-400 hover:text-white transition active:scale-90"
                  title="Bài kế tiếp"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              <div
                className="w-full md:max-w-md touch-none"
                style={{ touchAction: 'none' }}
              >
                <MagneticSeekbar
                  progressMV={progressMV}
                  currentTimeMV={currentTimeMV}
                  duration={actualDuration || currentTrack?.duration || 180}
                  onSeek={seekTo}
                />
              </div>
            </div>

            {/* Cụm phải (Desktop): Biểu đồ sóng nhảy 60fps + Slider âm lượng + Nút mở Queue */}
            <div className="hidden md:flex items-center gap-4 shrink-0">
              <div className="hidden lg:flex items-center">
                <DynamicSpectrumCanvas isPlaying={isPlaying} />
              </div>

              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                  className="text-zinc-400 hover:text-white transition"
                  title={volume === 0 ? 'Bật âm' : 'Tắt âm'}
                >
                  {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <button
                onClick={() => setIsQueueOpen(!isQueueOpen)}
                className="relative flex items-center p-1.5 text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
                title="Danh sách hàng đợi phát"
              >
                <ListMusic
                  className={`w-5 h-5 transition-colors ${
                    isQueueOpen ? 'text-neon-cyan' : 'hover:text-white'
                  }`}
                />
                {queueCount > 0 && (
                  <span className="absolute -top-1 -right-1 text-[10px] font-mono font-bold text-neon-cyan select-none">
                    {queueCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FloatingPlayerBar;
