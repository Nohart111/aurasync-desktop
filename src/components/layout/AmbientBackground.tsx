"use client";

import React, { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface AmbientBackgroundProps {
  primaryColor?: string;
  secondaryColor?: string;
}

export function AmbientBackground({
  primaryColor = "#B45309",
  secondaryColor = "#00F0FF",
}: AmbientBackgroundProps) {
  // The edge glow follows the cursor through CSS variables written straight to
  // the element, so mouse movement never re-renders React.
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId = 0;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = glowRef.current;
        if (!el) return;
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
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
          className="gpu-accelerated absolute -top-[15%] left-[10%] h-[55vh] w-[55vw] rounded-full opacity-25 blur-[130px]"
        />

        <motion.div
          animate={{ backgroundColor: secondaryColor }}
          transition={{ duration: 2.8, ease: "easeInOut" }}
          className="gpu-accelerated absolute -bottom-[20%] right-[5%] h-[50vh] w-[50vw] rounded-full opacity-20 blur-[140px]"
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
        ref={glowRef}
        className="pointer-events-none fixed inset-0 z-40 p-[1.5px]"
        style={{
          background: `radial-gradient(420px circle at var(--mx, -1000px) var(--my, -1000px), ${secondaryColor} 0%, ${primaryColor} 45%, transparent 70%)`,
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
