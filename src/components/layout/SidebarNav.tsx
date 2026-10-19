// src/components/layout/SidebarNav.tsx
"use client";

import React, { useRef, useState } from "react";
import { Music, PlusCircle, Loader2 } from "lucide-react";

export function SidebarNav() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("artist", "Nghệ sĩ chưa rõ");
      formData.append("duration", "180"); // fallback giây

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
    <aside className="glass-panel flex w-64 flex-col border-r border-glass-border p-5">
      <div className="flex items-center gap-2.5 pb-6">
        <Music className="h-6 w-6 text-neon-cyan" />
        <span className="font-display text-lg font-bold tracking-tight text-white">
          AuraSound
        </span>
      </div>

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
        className="flex items-center justify-center gap-2 rounded-xl bg-neon-violet/30 border border-neon-violet/50 px-4 py-2.5 text-sm font-semibold text-white shadow-neon-violet transition hover:bg-neon-violet/50 disabled:opacity-50"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
            <span>Đang đẩy lên GitHub...</span>
          </>
        ) : (
          <>
            <PlusCircle className="h-4 w-4 text-neon-cyan" />
            <span>Thêm bài hát mới</span>
          </>
        )}
      </button>
    </aside>
  );
}