// src/components/player/SpectrumVisualizer.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { usePlayerStore } from "@/store/usePlayerStore";

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
        // Lấy dải tần số thấp đến trung bình
        const val = isPlaying ? freqData[i * 2] || 0 : 4;
        const percent = val / 255;
        const barHeight = Math.max(3, percent * canvas.height);
        const x = i * (barWidth + gap);
        const y = canvas.height - barHeight;

        // Gradient màu Neon Cyan sang Violet
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