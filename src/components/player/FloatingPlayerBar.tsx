// src/components/player/FloatingPlayerBar.tsx
"use client";

import React, { useRef, useState, useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioEngine } from "@/core/audio/AudioEngine";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  ListMusic,
  Music,
} from "lucide-react";

// 1. THANH TUA NHẠC MAGNETIC SEEKBAR
export function MagneticSeekbar({
  progressMV,
  duration,
  onSeek,
}: {
  progressMV: any;
  duration: number;
  onSeek: (newTimeSeconds: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const scaleX = useSpring(progressMV, {
    stiffness: 600,
    damping: 45,
    mass: 0.2,
  });

  const glowOpacity = useSpring(isHovered ? 1 : 0, {
    stiffness: 400,
    damping: 30,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    onSeek(ratio * duration);
  };

  const thumbLeft = useTransform(progressMV, (v: number) => `${(v || 0) * 100}%`);

  return (
    <div
      ref={barRef}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onPointerDown={handlePointerDown}
      className="group relative flex h-6 w-full cursor-pointer items-center select-none"
    >
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 transition-all duration-200 group-hover:h-2.5">
        <motion.div
          style={{ scaleX, transformOrigin: "0% 50%" }}
          className="gpu-accelerated h-full w-full bg-gradient-to-r from-neon-violet via-neon-cyan to-emerald-400"
        />
      </div>

      <motion.div
        style={{ left: thumbLeft, opacity: glowOpacity }}
        className="gpu-accelerated pointer-events-none absolute -ml-2 h-4 w-4 rounded-full bg-white shadow-neon-cyan ring-2 ring-neon-cyan"
      />
    </div>
  );
}

// 2. SÓNG NHẠC SPECTRUM VISUALIZER
export function SpectrumVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const engine = AudioEngine.getInstance();
      const freqData = engine.getFrequencySnapshot();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 16;
      const barWidth = 3;
      const gap = 2;

      for (let i = 0; i < barCount; i++) {
        const val = isPlaying ? freqData[i * 2] || 0 : 4;
        const percent = val / 255;
        const barHeight = Math.max(3, percent * canvas.height);
        const x = i * (barWidth + gap);
        const y = canvas.height - barHeight;

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "#00F0FF");
        gradient.addColorStop(1, "#8A2BE2");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      rafIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={28}
      className="shrink-0 opacity-80"
    />
  );
}

// 3. THANH PLAYER CHÍNH (LUÔN HIỂN THỊ TRẠNG THÁI SẴN SÀNG)
export function FloatingPlayerBar({ onToggleQueue }: { onToggleQueue?: () => void }) {
  const {
    currentTrack,
    isPlaying,
    setPlaying,
    advanceNext,
    advancePrev,
    volume,
    setVolume,
    queueItems,
  } = usePlayerStore();

  const { progressMV, seekTo } = useAudioPlayer();

  const handleSeek = (targetSeconds: number) => {
    if (isNaN(targetSeconds)) return;
    seekTo(targetSeconds);
  };

  return (
    <footer className="glass-acrylic gpu-accelerated fixed bottom-4 left-[17.5rem] right-6 z-50 flex h-20 items-center justify-between rounded-2xl px-6">
      {/* Thông tin bài hát bên trái */}
      <div className="flex w-1/4 items-center gap-3.5 overflow-hidden">
        {currentTrack?.coverUrl ? (
          <img
            src={currentTrack.coverUrl}
            alt={currentTrack.title}
            className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-md"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neon-violet/20 border border-neon-violet/30 text-neon-cyan shadow-md">
            <Music className="h-6 w-6" />
          </div>
        )}
        <div className="truncate">
          <p className="truncate text-sm font-semibold text-white">
            {currentTrack ? currentTrack.title : "AuraSound Desktop"}
          </p>
          <p className="truncate text-xs text-zinc-400">
            {currentTrack ? (currentTrack.artist || "Nghệ sĩ chưa rõ") : "Sẵn sàng phát nhạc Lossless"}
          </p>
        </div>
      </div>

      {/* Cụm điều khiển Play / Pause & Seekbar ở giữa */}
      <div className="flex w-2/4 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button
            onClick={advancePrev}
            disabled={!currentTrack}
            className="text-zinc-400 transition hover:text-white disabled:opacity-40"
            title="Bài trước đó"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={() => currentTrack && setPlaying(!isPlaying)}
            disabled={!currentTrack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-neon-cyan transition hover:scale-105 active:scale-95 disabled:opacity-50"
            title={isPlaying ? "Tạm dừng" : "Phát"}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-black" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-black" />
            )}
          </button>
          <button
            onClick={advanceNext}
            disabled={!currentTrack}
            className="text-zinc-400 transition hover:text-white disabled:opacity-40"
            title="Bài tiếp theo"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        <div className="w-full max-w-md">
          <MagneticSeekbar
            progressMV={progressMV}
            duration={currentTrack?.duration || 180}
            onSeek={handleSeek}
          />
        </div>
      </div>

      {/* Sóng nhạc Canvas, Âm lượng & Nút Hàng đợi bên phải */}
      <div className="flex w-1/4 items-center justify-end gap-4">
        <SpectrumVisualizer />

        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-zinc-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="h-1 w-20 cursor-pointer accent-neon-cyan"
            title="Âm lượng"
          />
        </div>

        <button
          onClick={() => onToggleQueue?.()}
          className="relative rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          title="Hàng đợi"
        >
          <ListMusic className="h-5 w-5" />
          {queueItems.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon-cyan text-[10px] font-bold text-black">
              {queueItems.length}
            </span>
          )}
        </button>
      </div>
    </footer>
  );
}

export default FloatingPlayerBar;