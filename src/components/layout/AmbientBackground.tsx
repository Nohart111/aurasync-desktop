"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface AmbientBackgroundProps {
  primaryColor?: string;
  secondaryColor?: string;
}

export function AmbientBackground({
  primaryColor = "#8A2BE2",
  secondaryColor = "#00F0FF",
}: AmbientBackgroundProps) {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

  useEffect(() => {
    let rafId: number;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setMousePos({ x: e.clientX, y: e.clientY });
      });
    };

    window.addEventListener("mousemove", handleMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      {/* 1. NỀN NEON CHUYỂN ĐỘNG BỒNG BỀNH GỐC */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-obsidian-950 select-none">
        <motion.div
          animate={{ backgroundColor: primaryColor }}
          transition={{ duration: 2.4, ease: "easeInOut" }}
          className="gpu-accelerated absolute -top-[15%] left-[10%] h-[55vh] w-[55vw] rounded-full opacity-25 blur-[130px] animate-ambient-slow"
        />

        <motion.div
          animate={{ backgroundColor: secondaryColor }}
          transition={{ duration: 2.8, ease: "easeInOut" }}
          className="gpu-accelerated absolute -bottom-[20%] right-[5%] h-[50vh] w-[50vw] rounded-full opacity-20 blur-[140px] animate-ambient-reverse"
        />

        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.8) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      {/* 2. VIỀN MANG PHÁT QUANG PHẢN XẠ THEO CHUỘT (CHỈ Ở MÉP KHUNG NGOÀI) */}
      <div
        className="pointer-events-none fixed inset-0 z-40 p-[1.5px]"
        style={{
          background: `radial-gradient(420px circle at ${mousePos.x}px ${mousePos.y}px, ${secondaryColor} 0%, ${primaryColor} 45%, transparent 70%)`,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
    </>
  );
}

export default AmbientBackground;
