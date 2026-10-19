// src/components/layout/SidebarNav.tsx
"use client";

import React, { useRef, useState } from "react";
import {
  Compass,
  Library,
  PlusCircle,
  Loader2,
  Disc3,
  Sparkles,
} from "lucide-react";

export function SidebarNav() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("library");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("artist", "Nghệ sĩ chưa rõ");
      formData.append("duration", "180");

      const res = await fetch("/api/tracks/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Tải bài hát lên thất bại");
      window.location.reload();
    } catch (err) {
      alert("Lỗi tải lên: " + (err as Error).message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <aside className="glass-panel flex h-full w-64 flex-col justify-between border-r border-glass-border p-5 select-none shrink-0 z-20">
      <div className="space-y-6">
        {/* 3 nút điều khiển macOS */}
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[#FF5F56] shadow-sm hover:opacity-80 cursor-pointer" />
          <div className="h-3 w-3 rounded-full bg-[#FFBD2E] shadow-sm hover:opacity-80 cursor-pointer" />
          <div className="h-3 w-3 rounded-full bg-[#27C93F] shadow-sm hover:opacity-80 cursor-pointer" />
        </div>

        {/* Logo AuraSound */}
        <div className="flex items-center gap-2.5 pt-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-neon-violet to-neon-cyan shadow-neon-cyan">
            <Disc3 className="h-5 w-5 text-black animate-spin" style={{ animationDuration: "8s" }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-base font-bold tracking-tight text-white">
                AuraSound
              </span>
              <span className="rounded bg-neon-cyan/20 px-1.5 py-0.5 text-[9px] font-bold text-neon-cyan">
                LOSSLESS
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">Desktop Audio Engine</p>
          </div>
        </div>

        {/* Menu chỉ giữ lại Khám phá & Thư viện cá nhân */}
        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab("discover")}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              activeTab === "discover"
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Compass className="h-4 w-4 text-neon-cyan" />
            <span>Khám phá</span>
          </button>

          <button
            onClick={() => setActiveTab("library")}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
              activeTab === "library"
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Library className="h-4 w-4 text-neon-violet" />
            <span>Thư viện cá nhân</span>
          </button>
        </nav>
      </div>

      {/* Nút Upload nhạc lên GitHub Releases CDN */}
      <div className="space-y-3 pt-6 border-t border-glass-border">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="audio/*"
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-neon-violet/40 to-neon-cyan/40 border border-white/20 px-4 py-3 text-sm font-semibold text-white shadow-neon-violet transition hover:scale-[1.02] active:scale-95 disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
              <span className="text-xs">Đang đẩy lên GitHub...</span>
            </>
          ) : (
            <>
              <PlusCircle className="h-4 w-4 text-neon-cyan transition group-hover:rotate-90" />
              <span>Thêm bài hát mới</span>
            </>
          )}
        </button>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <Sparkles className="h-3 w-3 text-neon-cyan" />
          <span>Lưu trữ vĩnh viễn trên GitHub CDN</span>
        </div>
      </div>
    </aside>
  );
}

export default SidebarNav;