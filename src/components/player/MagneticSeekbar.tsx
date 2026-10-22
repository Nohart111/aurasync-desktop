// src/components/player/MagneticSeekbar.tsx
"use client";

import React, { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  MotionValue,
} from "framer-motion";

interface MagneticSeekbarProps {
  progressMV: MotionValue<number>; // Giá trị từ 0 -> 1 được đẩy trực tiếp từ requestAnimationFrame
  currentTimeMV: MotionValue<number>;
  duration: number;
  onSeek: (newTimeSeconds: number) => void;
}

export function MagneticSeekbar({
  progressMV,
  currentTimeMV,
  duration,
  onSeek,
}: MagneticSeekbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const isScrubbingRef = useRef(false);
  const lastCurrentSecondRef = useRef(Math.floor(currentTimeMV.get()));
  const lastPreviewSecondRef = useRef(-1);
  const [isHovered, setIsHovered] = useState(false);
  const [currentSecond, setCurrentSecond] = useState(() =>
    Math.floor(currentTimeMV.get())
  );
  const [previewSecond, setPreviewSecond] = useState(0);

  const displayProgress = useMotionValue(progressMV.get());
  const scaleX = useSpring(displayProgress, {
    stiffness: 600,
    damping: 45,
    mass: 0.2,
  });

  // MotionValue theo dõi vị trí chuột khi hover để hiển thị preview thời gian
  const hoverX = useMotionValue(0);
  const glowOpacity = useSpring(isHovered ? 1 : 0, {
    stiffness: 400,
    damping: 30,
  });

  const formatTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
  };

  useMotionValueEvent(progressMV, "change", (value) => {
    if (!isScrubbingRef.current) displayProgress.set(value);
  });

  useMotionValueEvent(currentTimeMV, "change", (value) => {
    const second = Math.floor(value);
    if (second !== lastCurrentSecondRef.current) {
      lastCurrentSecondRef.current = second;
      setCurrentSecond(second);
    }
  });

  const updatePointerPosition = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = rect.width > 0 ? clampedX / rect.width : 0;
    hoverX.set(clampedX);
    const second = Math.floor(ratio * duration);
    if (second !== lastPreviewSecondRef.current) {
      lastPreviewSecondRef.current = second;
      setPreviewSecond(second);
    }
    return ratio;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isScrubbingRef.current = true;
    setIsHovered(true);
    displayProgress.set(updatePointerPosition(e));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ratio = updatePointerPosition(e);
    if (isScrubbingRef.current) displayProgress.set(ratio);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    const ratio = updatePointerPosition(e);
    isScrubbingRef.current = false;
    setIsHovered(false);
    onSeek(ratio * duration);
    displayProgress.set(ratio);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePointerCancel = () => {
    isScrubbingRef.current = false;
    setIsHovered(false);
    displayProgress.set(progressMV.get());
  };

  const thumbLeft = useTransform(displayProgress, (v) => `${v * 100}%`);
  const tooltipLeft = useTransform(hoverX, (x) => `${x}px`);

  return (
    <div
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => {
        if (!isScrubbingRef.current) setIsHovered(false);
      }}
      className="group relative flex h-8 w-full touch-none cursor-pointer items-center select-none"
    >
      <span className="tabular-time w-11 shrink-0 text-left text-[11px] text-zinc-400">
        {formatTime(currentSecond)}
      </span>
      <div
        ref={barRef}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="relative flex h-full flex-1 items-center px-1"
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08] transition-all duration-300 ease-out group-hover:h-2.5 group-hover:bg-white/[0.12]">
          <motion.div
            style={{ scaleX, transformOrigin: "0% 50%" }}
            className="gpu-accelerated h-full w-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400"
          />
        </div>
        <motion.div
          style={{ left: thumbLeft, opacity: glowOpacity }}
          className="gpu-accelerated pointer-events-none absolute -ml-2 h-4 w-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.6)] ring-2 ring-white/80 transition-transform duration-150 group-hover:scale-125"
        />
        <motion.span
          style={{ left: tooltipLeft, opacity: glowOpacity }}
          className="tabular-time pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 rounded-lg bg-obsidian-900 px-2.5 py-1 text-[11px] text-white font-mono font-bold shadow-[0_4px_12px_rgba(0,0,0,0.6)] border border-white/15"
        >
          {formatTime(previewSecond)}
        </motion.span>
      </div>
      <span className="tabular-time w-11 shrink-0 text-right text-[11px] text-zinc-400">
        {formatTime(duration)}
      </span>
    </div>
  );
}
