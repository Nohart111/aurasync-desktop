// src/components/player/SpectrumVisualizer.tsx
"use client";

import { useEffect, useRef } from "react";
import { AudioEngine } from "@/core/audio/AudioEngine";

export function SpectrumVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const data = AudioEngine.getInstance().getFrequencySnapshot();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barCount = 28;
      const step = canvas.width / barCount;
      const barWidth = step * 0.65;

      for (let i = 0; i < barCount; i++) {
        const val = data[i] || 0;
        const barHeight = Math.max(3, (val / 255) * canvas.height * 0.9);
        const x = i * step;
        const y = canvas.height - barHeight;

        const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
        grad.addColorStop(0, "#00F0FF");
        grad.addColorStop(1, "#8A2BE2");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  return <canvas ref={canvasRef} width={140} height={32} className="opacity-90" />;
}