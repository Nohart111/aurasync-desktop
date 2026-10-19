// src/app/(desktop)/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { Play, Pause, Music, Plus, Clock } from "lucide-react";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

export default function DesktopHomePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { currentTrack, isPlaying, setPlaying, enqueueTrack, jumpToTrack } =
    usePlayerStore();

  useEffect(() => {
    async function loadTracks() {
      try {
        const res = await fetch("/api/tracks/search");
        if (res.ok) {
          const data = await res.json();
          setTracks(data.tracks || []);
        }
      } catch (err) {
        console.error("Lỗi tải danh sách bài hát:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTracks();
  }, []);

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setPlaying(!isPlaying);
    } else {
      enqueueTrack(track);
      jumpToTrack(track.id);
      setPlaying(true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">
          Thư viện nhạc cá nhân
        </h1>
        <p className="text-sm text-zinc-400">
          Âm thanh Lossless lưu trữ vĩnh viễn trên GitHub CDN
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-zinc-500">
          Đang nạp kho nhạc...
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
          <Music className="mb-3 h-10 w-10 text-zinc-600" />
          <p className="text-base font-medium text-zinc-300">Kho nhạc đang trống.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Bấm nút &quot;Thêm bài hát mới&quot; ở cột bên trái để tải bài hát đầu tiên!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Tiêu đề bảng danh sách */}
          <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 border-b border-glass-border">
            <span className="col-span-1">#</span>
            <span className="col-span-6">Tiêu đề</span>
            <span className="col-span-3">Nghệ sĩ</span>
            <span className="col-span-2 text-right">
              <Clock className="inline h-3.5 w-3.5 mr-1" /> Thời lượng
            </span>
          </div>

          {/* Danh sách từng bài hát */}
          {tracks.map((track, idx) => {
            const isCurrentPlaying = currentTrack?.id === track.id && isPlaying;
            const isCurrentSelected = currentTrack?.id === track.id;

            return (
              <div
                key={track.id || idx}
                onClick={() => handlePlayTrack(track)}
                className={`group grid grid-cols-12 items-center rounded-xl px-4 py-3 cursor-pointer transition ${
                  isCurrentSelected
                    ? "bg-neon-violet/20 border border-neon-violet/40"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="col-span-1 flex items-center">
                  <button className="text-zinc-400 group-hover:text-neon-cyan">
                    {isCurrentPlaying ? (
                      <Pause className="h-4 w-4 fill-neon-cyan text-neon-cyan" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                  </button>
                </div>

                <div className="col-span-6 flex items-center gap-3 overflow-hidden pr-4">
                  {track.coverUrl ? (
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                      <Music className="h-5 w-5" />
                    </div>
                  )}
                  <span
                    className={`truncate text-sm font-medium ${
                      isCurrentSelected ? "text-neon-cyan" : "text-zinc-100"
                    }`}
                  >
                    {track.title}
                  </span>
                </div>

                <div className="col-span-3 truncate text-sm text-zinc-400">
                  {track.artist || "Nghệ sĩ chưa rõ"}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      enqueueTrack(track);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-white transition"
                    title="Thêm vào hàng đợi"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="tabular-time text-xs text-zinc-500">
                    {Math.floor((track.duration || 180) / 60)}:
                    {String(Math.floor((track.duration || 180) % 60)).padStart(2, "0")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}