// src/components/player/MagneticSeekbar.tsx
"use client";

import React, { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from "framer-motion";

interface MagneticSeekbarProps {
  progressMV: MotionValue<number>; // Giá trị từ 0 -> 1 được đẩy trực tiếp từ requestAnimationFrame
  duration: number;
  onSeek: (newTimeSeconds: number) => void;
}

export function MagneticSeekbar({
  progressMV,
  duration,
  onSeek,
}: MagneticSeekbarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Chuyển đổi trực tiếp MotionValue (0 -> 1) sang chuỗi phần trăm CSS mà không qua useState
  const scaleX = useSpring(progressMV, {
    stiffness: 600,
    damping: 45,
    mass: 0.2,
  });

  // MotionValue theo dõi vị trí chuột khi hover để hiển thị preview thời gian
  const hoverX = useMotionValue(0);
  const hoverRatio = useMotionValue(0);
  const glowOpacity = useSpring(isHovered ? 1 : 0, {
    stiffness: 400,
    damping: 30,
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    hoverX.set(clampedX);
    hoverRatio.set(rect.width > 0 ? clampedX / rect.width : 0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min((e.clientX - rect.left) / rect.width, 1)
    );
    onSeek(ratio * duration);
  };

  const thumbLeft = useTransform(progressMV, (v) => `${v * 100}%`);

  return (
    <div
      ref={barRef}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      className="group relative flex h-6 w-full cursor-pointer items-center select-none"
    >
      {/* Rãnh nền kính mờ */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 transition-all duration-200 group-hover:h-2.5">
        {/* Thanh tiến trình phát sáng (GPU scaleX thay vì đổi width để đạt 60fps) */}
        <motion.div
          style={{ scaleX, transformOrigin: "0% 50%" }}
          className="gpu-accelerated h-full w-full bg-gradient-to-r from-neon-violet via-neon-cyan to-emerald-400"
        />
      </div>

      {/* Đầu trượt từ tính (Magnetic Thumb) phóng nhẹ khi hover */}
      <motion.div
        style={{ left: thumbLeft, opacity: glowOpacity }}
        className="gpu-accelerated pointer-events-none absolute -ml-2 h-4 w-4 rounded-full bg-white shadow-neon-cyan ring-2 ring-neon-cyan"
      />
    </div>
  );
}