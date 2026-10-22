import React from "react";
import SidebarNav from "@/components/layout/SidebarNav";
import FloatingPlayerBar from "@/components/player/FloatingPlayerBar";
import AmbientBackground from "@/components/layout/AmbientBackground";
import { KeyboardShortcutsHUD } from "@/components/player/KeyboardShortcutsHUD";
import { FocusStudioModal } from "@/components/player/FocusStudioModal";
import { StudioEqualizerModal } from "@/components/player/StudioEqualizerModal";

export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-obsidian-950 text-zinc-100">
      <AmbientBackground />
      <SidebarNav />
      <main className="relative z-10 flex-1 overflow-y-auto px-8 pt-8 pb-40">
        {children}
      </main>
      <FloatingPlayerBar />
      <KeyboardShortcutsHUD />
      <FocusStudioModal />
      <StudioEqualizerModal />
    </div>
  );
}
