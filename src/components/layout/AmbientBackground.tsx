// src/components/layout/AmbientBackground.tsx
"use client";

import { motion } from "framer-motion";

interface AmbientBackgroundProps {
  primaryColor?: string;
  secondaryColor?: string;
}

export function AmbientBackground({
  primaryColor = "#8A2BE2",
  secondaryColor = "#00F0FF",
}: AmbientBackgroundProps) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050508]">
      {/* Khối cầu Neon chủ đạo dịch chuyển theo bài hát */}
      <motion.div
        animate={{ backgroundColor: primaryColor }}
        transition={{ duration: 2.4, ease: "easeInOut" }}
        className="gpu-accelerated absolute -top-[15%] left-[10%] h-[55vh] w-[55vw] rounded-full opacity-25 blur-[130px] animate-ambient-slow"
      />

      {/* Khối cầu Neon phụ tạo chiều sâu đối lập */}
      <motion.div
        animate={{ backgroundColor: secondaryColor }}
        transition={{ duration: 2.8, ease: "easeInOut" }}
        className="gpu-accelerated absolute -bottom-[20%] right-[5%] h-[50vh] w-[50vw] rounded-full opacity-20 blur-[140px] animate-ambient-reverse"
      />

      {/* Lớp lưới vi điểm (Micro-grid) + vignette giúp nổi bật hiệu ứng kính mờ phía trên */}
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
