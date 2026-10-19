// src/app/(desktop)/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";
import { usePlayerStore } from "@/store/usePlayerStore";
import { Play } from "lucide-react";

export default function HomePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const { playTrackNow, currentTrack, isPlaying } = usePlayerStore();

  useEffect(() => {
    fetch("/api/tracks/search")
      .then((res) => res.json())
      .then((data) => setTracks(data.tracks || []))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Thư viện nhạc cá nhân</h1>
        <p className="text-sm text-zinc-400">Âm thanh Lossless lưu trữ vĩnh viễn trên GitHub CDN</p>
      </div>

      {tracks.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-center">
          <p className="text-zinc-400">Kho nhạc đang trống.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Bấm nút &quot;Thêm bài hát mới&quot; ở góc trái để tải bài hát đầu tiên!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {tracks.map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                onClick={() => playTrackNow(track)}
                className={`group relative cursor-pointer rounded-2xl p-3.5 transition ${
                  isCurrent
                    ? "bg-neon-violet/20 border border-neon-cyan/40 shadow-neon-cyan"
                    : "bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="relative aspect-square overflow-hidden rounded-xl">
                  <img
                    src={track.coverUrl}
                    alt={track.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                  <div
                    className={`absolute inset-0 flex items-center justify-center bg-black/40 transition ${
                      isCurrent && isPlaying ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neon-cyan text-black shadow-neon-cyan">
                      <Play className="ml-0.5 h-6 w-6 fill-black" />
                    </div>
                  </div>
                </div>
                <h3 className="mt-3 truncate text-sm font-semibold text-white">{track.title}</h3>
                <p className="truncate text-xs text-zinc-400">{track.artist}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}