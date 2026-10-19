// src/components/layout/SidebarNav.tsx
"use client";

import { useRef, useState } from "react";
import { Disc3, FolderMusic, PlusCircle, Radio, Loader2 } from "lucide-react";

function getAudioFileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(Math.round(audio.duration) || 180);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(180);
    };
  });
}

export function SidebarNav({ onTrackUploaded }: { onTrackUploaded: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const duration = await getAudioFileDuration(file);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^/.]+$/, ""));
      fd.append("duration", String(duration));

      const res = await fetch("/api/tracks/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tải file");
      onTrackUploaded();
    } catch (err: any) {
      alert("Lỗi upload: " + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <aside className="glass-panel flex w-64 flex-col justify-between p-5 select-none">
      <div className="space-y-6">
        <div className="flex items-center gap-2.5">
          <Disc3 className="h-7 w-7 text-neon-cyan" />
          <span className="font-display text-lg font-bold tracking-tight text-white">AuraSound</span>
        </div>

        <nav className="space-y-1">
          <button className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white">
            <FolderMusic className="h-4 w-4 text-neon-cyan" />
            Thư viện nhạc
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white">
            <Radio className="h-4 w-4" />
            Phòng nghe chung
          </button>
        </nav>
      </div>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon-violet to-neon-cyan py-3 text-sm font-semibold text-white shadow-neon-cyan transition hover:opacity-90 disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
          {isUploading ? "Đang tải lên CDN..." : "Thêm bài hát mới"}
        </button>
      </div>
    </aside>
  );
}