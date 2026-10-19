
"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  Disc3,
  FileMusic,
  PlusCircle,
  Radio,
  Loader2,
} from "lucide-react";

const DEFAULT_DURATION = 180;

function getAudioFileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);

    audio.preload = "metadata";

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.removeEventListener("error", handleError);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    };

    const handleMetadata = () => {
      const duration = audio.duration;

      cleanup();

      resolve(
        Number.isFinite(duration) && duration > 0
          ? Math.round(duration)
          : DEFAULT_DURATION,
      );
    };

    const handleError = () => {
      cleanup();
      resolve(DEFAULT_DURATION);
    };

    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("error", handleError);

    audio.src = objectUrl;
    audio.load();
  });
}

type SidebarNavProps = {
  onTrackUploaded: () => void;
};

export function SidebarNav({ onTrackUploaded }: SidebarNavProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    try {
      setIsUploading(true);

      const duration = await getAudioFileDuration(file);
      const formData = new FormData();

      formData.append("file", file);
      formData.append(
        "title",
        file.name.replace(/\.[^/.]+$/, ""),
      );
      formData.append("duration", String(duration));

      const response = await fetch("/api/tracks/upload", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Không thể tải file lên.");
      }

      onTrackUploaded();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Đã xảy ra lỗi không xác định.";

      window.alert(`Lỗi upload: ${message}`);
    } finally {
      setIsUploading(false);
      input.value = "";
    }
  };

  return (
    <aside className="glass-panel flex w-64 flex-col justify-between p-5 select-none">
      <div className="space-y-6">
        <div className="flex items-center gap-2.5">
          <Disc3 className="h-7 w-7 text-neon-cyan" />

          <span className="font-display text-lg font-bold tracking-tight text-white">
            AuraSound
          </span>
        </div>

        <nav className="space-y-1">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white"
          >
            <FileMusic className="h-4 w-4 text-neon-cyan" />
            Thư viện nhạc
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
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
          disabled={isUploading}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-neon-violet to-neon-cyan py-3 text-sm font-semibold text-white shadow-neon-cyan transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlusCircle className="h-4 w-4" />
          )}

          {isUploading ? "Đang tải lên CDN..." : "Thêm bài hát mới"}
        </button>
      </div>
    </aside>
  );
}
