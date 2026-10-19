// src/app/(desktop)/layout.tsx
import { SidebarNav } from "@/components/layout/SidebarNav";
import FloatingPlayerBar from "@/components/player/FloatingPlayerBar";
import { AmbientBackground } from "@/components/layout/AmbientBackground";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-obsidian-950 text-zinc-100">
      {/* Nền ánh sáng Neon mờ */}
      <AmbientBackground />

      {/* Cột điều hướng bên trái chứa nút "Thêm bài hát mới" */}
      <SidebarNav />

      {/* Vùng nội dung chính giữa (cuộn độc lập) */}
      <main className="flex-1 overflow-y-auto px-8 pt-8 pb-32">
        {children}
      </main>

      {/* Thanh phát nhạc nổi ở dưới đáy */}
      <FloatingPlayerBar />
    </div>
  );
}