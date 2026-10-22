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
  AlignLeft,
  Maximize2,
  HelpCircle,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

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
          for (let i = 0; i < 32; i++) sum += data[i] || 0;
          if (sum > 4) hasData = true;
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
            const sampleIdx = Math.min(63, Math.floor(i * 2.2));
            const val = dataArrayRef.current[sampleIdx] || 0;
            const norm = Math.min(1.0, Math.max(0.04, val / 120));
            targetHeight = Math.max(2, Math.min(maxHeight, Math.pow(norm, 0.88) * maxHeight));
          } else {
            const trackTime = phase * 0.6;
            const wave = Math.sin(trackTime * 4.0 + i * 0.4) * 0.5 + 0.5;
            const beat = Math.pow(Math.max(0, Math.sin(trackTime * 4.0)), 3.0);
            targetHeight = Math.max(2, (wave * 0.55 + beat * 0.45) * maxHeight * 0.9);
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
    isLyricsOpen,
    toggleLyrics,
    toggleFocusMode,
    toggleShortcuts,
    setVolume,
  } = usePlayerStore();

  const { progressMV, currentTimeMV, actualDuration, seekTo } = useAudioPlayer();

  const handleTogglePlay = () => {
    playMechanicalSound('switch');
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
    playMechanicalSound('tape');
    usePlayerStore.getState().advanceNext();
  };

  const handlePrev = () => {
    playMechanicalSound('tape');
    usePlayerStore.getState().advancePrev();
  };

  const queueList = queue || queueItems || [];
  const queueCount = queueList.length;

  return (
    <>
      {/* 1. THANH ĐIỀU HƯỚNG ĐÁY DÀNH RIÊNG CHO MOBILE (< 768px) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden h-16 items-center justify-around border-t border-white/[0.08] bg-[#080811]/95 px-3 backdrop-blur-2xl select-none font-sans thumb-zone-safe">
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'vault' }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[52px] text-zinc-300 transition-all duration-150 hover:text-white active:scale-90"
        >
          <Radio className="h-4 w-4 text-zinc-300" />
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
          className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[52px] text-zinc-300 transition-all duration-150 hover:text-white active:scale-90"
        >
          <Compass className="h-4 w-4 text-zinc-300" />
          <span className="text-[10px] font-medium">Khám phá</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:switch-view', { detail: 'vault' }));
            const el = document.getElementById('catalog-section');
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          }}
          className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[52px] text-zinc-400 transition-all duration-150 hover:text-white active:scale-90"
        >
          <Library className="h-4 w-4" />
          <span className="text-[10px] font-medium">Kho nhạc</span>
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('aurasound:open-ingest-modal'));
          }}
          className="flex flex-col items-center justify-center gap-1 px-3 py-1.5 min-w-[52px] text-zinc-300 transition-all duration-150 hover:text-white active:scale-90"
        >
          <CloudDownload className="h-4 w-4 text-zinc-300" />
          <span className="text-[10px] font-medium">Nạp nhạc</span>
        </button>
      </nav>

      {/* 2. NGĂN KÉO QUEUE TRƯỢT TỪ CẠNH PHẢI KHI BẤM NÚT */}
      <AnimatePresence>
        {isQueueOpen && (
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 0.8 }}
            className="fixed left-3 right-3 sm:left-auto sm:right-4 top-4 bottom-[8.5rem] md:bottom-28 z-50 flex w-auto sm:w-96 flex-col rounded-2xl border border-white/10 bg-[#0c0c16]/95 p-4 sm:p-5 shadow-[0_24px_64px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <ListMusic className="h-5 w-5 text-amber-400" />
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
                          ? 'bg-white/[0.08] border border-white/20 text-white shadow-sm'
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
                              isCurrent ? 'text-white font-bold' : 'text-zinc-100'
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
                          <span className="inline-flex items-center gap-1.5 text-[9px] font-mono font-bold bg-white/10 text-amber-300 px-1.5 py-0.5 rounded">
                            <span className="eq-bars text-amber-400">
                              <span /><span /><span />
                            </span>
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
          className={`fixed bottom-[4.25rem] md:bottom-4 left-2.5 right-2.5 z-40 transition-all duration-300 ease-in-out ${
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="overflow-hidden min-w-0 flex-1">
                      {currentTrack.title.length > 20 ? (
                        <div className="marquee-container md:overflow-visible">
                          <div className="marquee-text md:animate-none md:p-0">
                            <h4 className="text-xs sm:text-sm font-semibold text-white whitespace-nowrap">
                              {currentTrack.title}
                            </h4>
                            <span className="mx-3 text-zinc-600 text-[10px] select-none">•</span>
                            <h4 className="text-xs sm:text-sm font-semibold text-white whitespace-nowrap md:hidden">
                              {currentTrack.title}
                            </h4>
                            <span className="mx-3 text-zinc-600 text-[10px] select-none md:hidden">•</span>
                          </div>
                        </div>
                      ) : (
                        <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
                          {currentTrack.title}
                        </h4>
                      )}
                    </div>
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
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-lg shadow-white/20 transition-all duration-150 active:scale-90 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] border border-white/30"
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
                  onClick={() => {
                    playMechanicalSound('toggle');
                    toggleLyrics();
                  }}
                  className={`p-1.5 transition active:scale-90 ${
                    isLyricsOpen ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Lời bài hát VFD"
                >
                  <AlignLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsQueueOpen(!isQueueOpen)}
                  className="relative flex items-center p-1.5 text-zinc-400 hover:text-white transition active:scale-95"
                  title="Danh sách hàng đợi phát"
                >
                  <ListMusic
                    className={`w-4 h-4 transition-colors ${
                      isQueueOpen ? 'text-amber-400' : 'hover:text-white'
                    }`}
                  />
                  {queueCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 text-[9px] font-mono font-bold text-amber-400 select-none">
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
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg shadow-white/20 transition-all duration-150 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] border border-white/20"
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
                  className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  toggleLyrics();
                }}
                className={`p-1.5 transition active:scale-95 cursor-pointer ${
                  isLyricsOpen ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
                }`}
                title="Lời bài hát VFD"
              >
                <AlignLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  toggleFocusMode();
                }}
                className="p-1.5 text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
                title="Chế độ Focus Studio [Z]"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  playMechanicalSound('switch');
                  toggleShortcuts();
                }}
                className="p-1.5 text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
                title="Bảng phím tắt Cyberdeck [?]"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  setIsQueueOpen(!isQueueOpen);
                }}
                className="relative flex items-center p-1.5 text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
                title="Danh sách hàng đợi phát"
              >
                <ListMusic
                  className={`w-5 h-5 transition-colors ${
                    isQueueOpen ? 'text-amber-400' : 'hover:text-white'
                  }`}
                />
                {queueCount > 0 && (
                  <span className="absolute -top-1 -right-1 text-[10px] font-mono font-bold text-amber-400 select-none">
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
