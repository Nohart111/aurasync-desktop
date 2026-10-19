"use client";

import React, { useRef, useState, useEffect } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import {
  Compass,
  Library,
  Plus,
  PlusCircle,
  Loader2,
  Disc3,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export function SidebarNav() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("library");

  const { isSidebarCollapsed, toggleSidebar } = usePlayerStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const trackTitle = file.name.replace(/\.[^/.]+$/, "");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", trackTitle);
      formData.append("artist", "Nghệ sĩ chưa rõ");
      formData.append("duration", "180");

      const res = await fetch("/api/tracks/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Lỗi tải lên (HTTP ${res.status})`);
      }

      alert(`🎉 Đã tải bài hát "${trackTitle}" lên CDN GitHub thành công!`);
      window.location.reload();
    } catch (err) {
      alert("⚠️ " + (err as Error).message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <aside
      className={`glass-panel relative flex h-full flex-col justify-between border-r border-glass-border select-none shrink-0 z-20 transition-all duration-300 ease-in-out ${
        isSidebarCollapsed ? "w-20 p-3" : "w-64 p-5"
      }`}
    >
      <div className="space-y-6">
        {/* Nút Thu/Mở Sidebar (Đã loại bỏ 3 dấu chấm đỏ-vàng-xanh) */}
        <div className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-end"}`}>
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center rounded-xl p-2 text-zinc-400 border border-white/10 bg-white/5 transition hover:border-neon-cyan/40 hover:bg-neon-cyan/10 hover:text-neon-cyan active:scale-95 shadow-sm"
            title={isSidebarCollapsed ? "Mở rộng Sidebar (Ctrl+B)" : "Thu gọn Sidebar (Ctrl+B)"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-neon-cyan" />
            ) : (
              <PanelLeftClose className="h-4 w-4 text-zinc-400" />
            )}
          </button>
        </div>

        {/* Logo AuraSound */}
        <div
          className={`flex items-center gap-2.5 pt-1 ${
            isSidebarCollapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-neon-violet to-neon-cyan shadow-neon-cyan">
            <Disc3 className="h-5 w-5 text-black animate-spin" style={{ animationDuration: "8s" }} />
          </div>
          {!isSidebarCollapsed && (
            <div className="overflow-hidden truncate transition-opacity duration-200">
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
          )}
        </div>

        {/* Menu Điều Hướng */}
        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab("discover")}
            className={`flex w-full items-center rounded-xl transition ${
              isSidebarCollapsed
                ? "h-11 justify-center px-0"
                : "gap-3 px-3.5 py-2.5 text-sm font-medium"
            } ${
              activeTab === "discover"
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
            title="Khám phá"
          >
            <Compass className="h-5 w-5 shrink-0 text-neon-cyan" />
            {!isSidebarCollapsed && <span>Khám phá</span>}
          </button>

          <button
            onClick={() => setActiveTab("library")}
            className={`flex w-full items-center rounded-xl transition ${
              isSidebarCollapsed
                ? "h-11 justify-center px-0"
                : "gap-3 px-3.5 py-2.5 text-sm font-medium"
            } ${
              activeTab === "library"
                ? "bg-white/10 text-white shadow-sm"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
            title="Thư viện cá nhân"
          >
            <Library className="h-5 w-5 shrink-0 text-neon-violet" />
            {!isSidebarCollapsed && <span>Thư viện cá nhân</span>}
          </button>
        </nav>
      </div>

      {/* Cụm Nút Thêm Bài Hát */}
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
          className={`group relative flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-neon-violet/40 to-neon-cyan/40 border border-white/20 text-white shadow-neon-violet transition hover:scale-[1.05] active:scale-95 disabled:opacity-50 ${
            isSidebarCollapsed ? "h-12 w-12 mx-auto" : "w-full gap-2 px-4 py-3 text-sm font-semibold"
          }`}
          title="Thêm bài hát mới lên GitHub CDN"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-neon-cyan" />
          ) : isSidebarCollapsed ? (
            <Plus className="h-5 w-5 text-neon-cyan transition group-hover:rotate-90" />
          ) : (
            <>
              <PlusCircle className="h-5 w-5 shrink-0 text-neon-cyan transition group-hover:rotate-90" />
              <span>Thêm bài hát mới</span>
            </>
          )}
        </button>

        {!isSidebarCollapsed && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <Sparkles className="h-3 w-3 text-neon-cyan" />
            <span>Lưu trữ vĩnh viễn trên GitHub CDN</span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default SidebarNav;
