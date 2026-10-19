// src/app/(desktop)/layout.tsx
import React from "react";
import SidebarNav from "@/components/layout/SidebarNav";
import FloatingPlayerBar from "@/components/player/FloatingPlayerBar";
import { AmbientBackground } from "@/components/layout/AmbientBackground";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-obsidian-950 text-zinc-100">
      {/* Nền Neon chuyển màu mờ ảo */}
      <AmbientBackground />

      {/* Cột Sidebar bên trái chuẩn Apple Music macOS */}
      <SidebarNav />

      {/* Vùng nội dung chính ở giữa (cuộn mượt độc lập) */}
      <main className="flex-1 overflow-y-auto px-8 pt-8 pb-32">
        {children}
      </main>

      {/* Thanh phát nhạc nổi luôn hiển thị ở dưới đáy */}
      <FloatingPlayerBar />
    </div>
  );
}