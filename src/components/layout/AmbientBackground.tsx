// src/components/layout/AmbientBackground.tsx
"use client";

import React, { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export function AmbientBackground() {
  // Tọa độ con trỏ chuột
  const mouseX = useMotionValue(-500);
  const mouseY = useMotionValue(-500);

  // Hiệu ứng lò xo tạo độ trễ bám đuổi mềm mại (Spring Physics)
  const springX = useSpring(mouseX, { stiffness: 180, damping: 28 });
  const springY = useSpring(mouseY, { stiffness: 180, damping: 28 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX - 200); // Căn tâm đốm sáng vào đầu trỏ chuột
      mouseY.set(e.clientY - 200);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-obsidian-950 select-none">
      {/* 1. ĐỐM SÁNG NEON BÁM THEO CON TRỎ CHUỘT THỜI GIAN THỰC */}
      <motion.div
        style={{
          x: springX,
          y: springY,
        }}
        className="gpu-accelerated absolute h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-neon-violet/30 via-neon-cyan/25 to-transparent blur-[110px]"
      />

      {/* 2. Khối cầu Neon tím góc trên bên trái */}
      <div className="gpu-accelerated absolute -top-[15%] left-[10%] h-[50vh] w-[50vw] rounded-full bg-neon-violet/20 blur-[130px] animate-ambient-slow" />

      {/* 3. Khối cầu Neon lục/lam góc dưới bên phải */}
      <div className="gpu-accelerated absolute -bottom-[20%] right-[5%] h-[45vh] w-[45vw] rounded-full bg-neon-cyan/15 blur-[140px] animate-ambient-reverse" />

      {/* 4. Lớp lưới vi điểm (Micro-grid) chống xé hình */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255, 255, 255, 0.8) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  );
}

export default AmbientBackground;