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
  Trash2
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
      phase += 0.08;
      let hasData = false;

      // Đọc dữ liệu tần số từ Web Audio Analyser (chứa FFT thật từ bài hát)
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
            // Lấy mẫu tần số từ dải trầm sang dải cao
            const sampleIdx = Math.min(63, Math.floor(i * 2 + 1));
            const val = dataArrayRef.current[sampleIdx] || 0;
            const norm = Math.max(0, val - 30) / 180;
            targetHeight = Math.max(2, Math.min(maxHeight, Math.pow(norm, 1.3) * maxHeight));
          } else {
            // Fallback sóng analog mượt mà nhịp nhàng khi node đang buffer
            const wave = Math.sin(phase * 1.4 + i * 0.45) * 0.5 + 0.5;
            targetHeight = Math.max(2, wave * maxHeight * 0.85);
          }
        }

        // Quán tính đàn hồi mượt mà cho từng cột sóng
        if (targetHeight > smoothedHeights.current[i]) {
          smoothedHeights.current[i] += (targetHeight - smoothedHeights.current[i]) * 0.45;
        } else {
          smoothedHeights.current[i] = Math.max(2, smoothedHeights.current[i] * 0.82 - 0.2);
        }

        const h = Math.round(smoothedHeights.current[i]);
        const x = i * (barWidth + barGap);
        const y = canvas.height - h;

        // Gradient tím violet -> xanh cyan chuẩn theo ảnh gốc
        const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
        grad.addColorStop(0, '#c084fc'); // Purple-400
        grad.addColorStop(0.5, '#06b6d4'); // Cyan-500
        grad.addColorStop(1, '#00F0FF'); // Neon Cyan

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, h, [1.5, 1.5, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, h);
        }
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={16 * 6} // 16 cột x (3px độ rộng + 3px khoảng cách) = 96px
      height={22}
      className="shrink-0 select-none pointer-events-none"
    />
  );
}

// ========================================================
// 🎵 FLOATING PLAYER BAR NGUYÊN BẢN TÍCH HỢP QUEUE DRAWER
// ========================================================
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

  if (!currentTrack) return null;

  const queueList = queue || queueItems || [];
  const queueCount = queueList.length;

  return (
    <>
      {/* 1. NGĂN KÉO QUEUE TRƯỢT TỪ CẠNH PHẢI KHI BẤM NÚT */}
      <AnimatePresence>
        {isQueueOpen && (
          <motion.aside
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed right-4 top-4 bottom-28 z-50 flex w-80 sm:w-96 flex-col rounded-2xl border border-white/10 bg-[#0c0c16]/95 p-5 shadow-2xl backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <ListMusic className="h-5 w-5 text-neon-cyan" />
                <h3 className="font-mono text-sm font-bold text-white tracking-wide">
                  HÀNG ĐỢI PHÁT ({queueCount})
                </h3>
              </div>
              <button
                onClick={() => setIsQueueOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
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
                          <p className={`truncate text-xs font-semibold ${isCurrent ? 'text-neon-cyan' : 'text-zinc-100'}`}>
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
                          className="p-1 text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition"
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

      {/* 2. THANH DOCK PHÁT NHẠC NGUYÊN BẢN */}
      <div
        className={`fixed bottom-4 right-4 z-40 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'left-[5.5rem]' : 'left-[17rem]'
        }`}
      >
        <div className="bg-[#0a0a14]/95 border border-white/[0.08] rounded-2xl p-3 px-5 shadow-2xl backdrop-blur-xl flex items-center justify-between gap-4">
          {/* Cụm trái: Bìa vuông icon Music & Tên bài hát */}
          <div className="flex items-center gap-3 min-w-[200px] max-w-[260px]">
            <div className="w-12 h-12 rounded-xl border border-white/10 bg-[#0d0d17] flex items-center justify-center shrink-0 shadow-md">
              <Music className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-white truncate">
                {currentTrack.title}
              </h4>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {currentTrack.artist || 'Nghệ sĩ chưa rõ'}
              </p>
            </div>
          </div>

          {/* Cụm giữa: Nút điều khiển & Thanh Seekbar */}
          <div className="flex-1 flex flex-col items-center justify-center max-w-xl px-2">
            <div className="flex items-center gap-5 mb-1.5">
              <button
                onClick={handlePrev}
                className="text-zinc-400 hover:text-white transition active:scale-90 cursor-pointer"
                title="Bài trước"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={handleTogglePlay}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg transition hover:scale-105 active:scale-95 cursor-pointer"
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
                className="text-zinc-400 hover:text-white transition active:scale-90 cursor-pointer"
                title="Bài kế tiếp"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full max-w-md">
              <MagneticSeekbar
                progressMV={progressMV}
                currentTimeMV={currentTimeMV}
                duration={actualDuration || currentTrack?.duration || 180}
                onSeek={seekTo}
              />
            </div>
          </div>

          {/* Cụm phải: Biểu đồ sóng nhảy 60fps + Slider âm lượng + Nút mở Queue */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Sóng nhạc Canvas 60fps nhảy theo nhạc thật */}
            <DynamicSpectrumCanvas isPlaying={isPlaying} />

            {/* Thanh chỉnh âm lượng màu xanh */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
                className="text-zinc-400 hover:text-white transition cursor-pointer"
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

            {/* Nút bấm mở Queue Drawer */}
            <button
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              className="relative flex items-center p-1.5 text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
              title="Danh sách hàng đợi phát"
            >
              <ListMusic className={`w-5 h-5 transition-colors ${isQueueOpen ? 'text-neon-cyan' : 'hover:text-white'}`} />
              {queueCount > 0 && (
                <span className="absolute -top-1 -right-1 text-[10px] font-mono font-bold text-neon-cyan select-none">
                  {queueCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default FloatingPlayerBar;
