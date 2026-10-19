// src/app/(desktop)/page.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import {
  Play,
  Pause,
  Clock,
  Heart,
  ListPlus,
  Search,
  Shuffle,
  Music2,
  Disc3,
  Sparkles,
} from "lucide-react";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

export default function SpotifyStyleLibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());

  const { currentTrack, isPlaying, setPlaying, enqueueTrack, jumpToTrack } =
    usePlayerStore();

  // Nạp danh sách bài hát từ API (tắt cache để luôn nhận bài mới nhất)
  useEffect(() => {
    async function loadTracks() {
      try {
        const res = await fetch("/api/tracks/search?t=" + Date.now(), {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.tracks || [];
          setTracks(list);
        }
      } catch (err) {
        console.error("Lỗi nạp bài hát:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTracks();
  }, []);

  // Lọc bài hát theo ô tìm kiếm
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [tracks, searchQuery]);

  // Xử lý phát bài hát
  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setPlaying(!isPlaying);
    } else {
      enqueueTrack(track);
      jumpToTrack(track.id);
      setPlaying(true);
    }
  };

  // Nút Play tròn to: Phát tất cả bài hát từ đầu
  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    tracks.forEach((t) => enqueueTrack(t));
    jumpToTrack(tracks[0].id);
    setPlaying(true);
  };

  // Nút xáo trộn bài hát
  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    shuffled.forEach((t) => enqueueTrack(t));
    jumpToTrack(shuffled[0].id);
    setPlaying(true);
  };

  const toggleLike = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const formatDuration = (seconds: number) => {
    const s = Math.floor(seconds || 180);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <div className="space-y-6 pb-12 select-none">
      {/* 1. HERO HEADER PHONG CÁCH SPOTIFY DESKTOP */}
      <section className="flex flex-col sm:flex-row items-end gap-6 pt-2 pb-4">
        {/* Bìa Playlist lớn dạng Vinyl Gradient */}
        <div className="group relative flex h-48 w-48 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-violet via-purple-900 to-obsidian-900 shadow-2xl shadow-neon-violet/30 border border-white/10">
          <Disc3
            className={`h-24 w-24 text-white/80 transition-transform duration-700 ${
              isPlaying ? "animate-spin" : "group-hover:rotate-45"
            }`}
            style={{ animationDuration: "10s" }}
          />
          <div className="absolute inset-0 rounded-2xl bg-black/20" />
        </div>

        {/* Thông tin Playlist */}
        <div className="flex flex-1 flex-col justify-end space-y-2">
          <span className="text-xs font-bold tracking-wider uppercase text-neon-cyan flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Danh sách phát công khai
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white drop-shadow-md">
            Bài hát đã lưu
          </h1>
          <p className="text-sm text-zinc-400">
            Kho âm thanh Lossless chất lượng phòng thu lưu trữ trực tiếp trên GitHub CDN
          </p>
          <div className="flex items-center gap-2 pt-1 text-xs font-medium text-zinc-300">
            <span className="font-bold text-white">AuraSound</span>
            <span>•</span>
            <span>{tracks.length} bài hát</span>
            <span>•</span>
            <span className="text-zinc-400">Không giới hạn dung lượng</span>
          </div>
        </div>
      </section>

      {/* 2. THANH CÔNG CỤ (NÚT PLAY SPOTIFY, TRỘN BÀI & TÌM KIẾM) */}
      <section className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-4">
          {/* Nút Play xanh lá tròn to chuẩn Spotify */}
          <button
            onClick={handlePlayAll}
            disabled={tracks.length === 0}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
            title="Phát tất cả"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-black" />
            ) : (
              <Play className="ml-1 h-6 w-6 fill-black" />
            )}
          </button>

          {/* Nút trộn bài */}
          <button
            onClick={handleShuffle}
            disabled={tracks.length === 0}
            className="rounded-full p-2.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            title="Trộn bài ngẫu nhiên"
          >
            <Shuffle className="h-5 w-5" />
          </button>
        </div>

        {/* Ô tìm kiếm nhanh bài hát */}
        <div className="relative w-64 sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm bài hát, nghệ sĩ..."
            className="w-full rounded-full bg-white/5 border border-white/10 pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none transition focus:border-neon-cyan focus:bg-white/10"
          />
        </div>
      </section>

      {/* 3. BẢNG DANH SÁCH BÀI HÁT (SPOTIFY TRACKLIST TABLE) */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-zinc-500">
          Đang nạp thư viện nhạc...
        </div>
      ) : filteredTracks.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
          <Music2 className="mb-3 h-10 w-10 text-zinc-600" />
          <p className="text-base font-semibold text-zinc-300">
            {tracks.length === 0
              ? "Kho nhạc đang trống."
              : "Không tìm thấy bài hát phù hợp."}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {tracks.length === 0
              ? "Bấm nút 'Thêm bài hát mới' ở thanh bên trái để tải bài hát đầu tiên lên GitHub!"
              : "Thử tìm kiếm với từ khóa khác."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Tiêu đề các cột */}
          <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-white/10">
            <span className="col-span-1 text-center">#</span>
            <span className="col-span-6 sm:col-span-5">Tiêu đề</span>
            <span className="hidden sm:block sm:col-span-3">Album</span>
            <span className="hidden md:block md:col-span-2">Nguồn</span>
            <span className="col-span-5 sm:col-span-3 md:col-span-1 text-right flex items-center justify-end">
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Hàng từng bài hát */}
          {filteredTracks.map((track, idx) => {
            const isThisPlaying = currentTrack?.id === track.id && isPlaying;
            const isThisActive = currentTrack?.id === track.id;
            const isLiked = likedTrackIds.has(track.id);

            return (
              <div
                key={track.id || idx}
                onClick={() => handlePlayTrack(track)}
                className={`group grid grid-cols-12 items-center rounded-xl px-4 py-2.5 transition cursor-pointer select-none ${
                  isThisActive
                    ? "bg-white/15 border border-white/10"
                    : "hover:bg-white/10"
                }`}
              >
                {/* Cột 1: Thứ tự (#) hoặc nút Play khi hover / Sóng nhạc khi đang phát */}
                <div className="col-span-1 flex items-center justify-center text-sm font-medium">
                  {isThisPlaying ? (
                    <div className="flex items-end gap-0.5 h-3.5 w-3.5">
                      <span className="h-full w-1 bg-emerald-400 animate-pulse" />
                      <span className="h-2/3 w-1 bg-emerald-400 animate-pulse delay-75" />
                      <span className="h-4/5 w-1 bg-emerald-400 animate-pulse delay-150" />
                    </div>
                  ) : (
                    <>
                      <span className="text-zinc-500 group-hover:hidden tabular-nums">
                        {idx + 1}
                      </span>
                      <Play className="hidden h-3.5 w-3.5 fill-white text-white group-hover:block" />
                    </>
                  )}
                </div>

                {/* Cột 2: Ảnh bìa đĩa nhỏ + Tên bài hát + Nghệ sĩ */}
                <div className="col-span-6 sm:col-span-5 flex items-center gap-3 overflow-hidden pr-2">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 shadow-sm overflow-hidden">
                    {track.coverUrl ? (
                      <img
                        src={track.coverUrl}
                        alt={track.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Music2 className="h-5 w-5 text-zinc-500" />
                    )}
                  </div>
                  <div className="truncate">
                    <p
                      className={`truncate text-sm font-medium transition ${
                        isThisActive
                          ? "text-emerald-400 font-semibold"
                          : "text-zinc-100 group-hover:text-white"
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {track.artist || "Nghệ sĩ chưa rõ"}
                    </p>
                  </div>
                </div>

                {/* Cột 3: Album */}
                <div className="hidden sm:block sm:col-span-3 truncate text-xs text-zinc-400">
                  {track.album || "Lossless Single"}
                </div>

                {/* Cột 4: Nguồn lưu trữ (GitHub CDN) */}
                <div className="hidden md:flex md:col-span-2 items-center gap-1.5">
                  <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[10px] font-medium text-neon-cyan">
                    GitHub CDN
                  </span>
                </div>

                {/* Cột 5: Nút Like, Thêm hàng đợi & Thời lượng */}
                <div className="col-span-5 sm:col-span-3 md:col-span-1 flex items-center justify-end gap-3 text-right">
                  {/* Nút Thả tim (Like) */}
                  <button
                    onClick={(e) => toggleLike(e, track.id)}
                    className={`p-1 transition ${
                      isLiked
                        ? "text-emerald-400 opacity-100"
                        : "text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-white"
                    }`}
                    title={isLiked ? "Bỏ thích" : "Yêu thích"}
                  >
                    <Heart
                      className={`h-4 w-4 ${isLiked ? "fill-emerald-400" : ""}`}
                    />
                  </button>

                  {/* Nút Thêm vào hàng đợi */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      enqueueTrack(track);
                    }}
                    className="p-1 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-white"
                    title="Thêm vào danh sách chờ"
                  >
                    <ListPlus className="h-4 w-4" />
                  </button>

                  {/* Thời lượng */}
                  <span className="tabular-time text-xs text-zinc-400 w-10 text-right">
                    {formatDuration(track.duration)}
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