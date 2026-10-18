"use client";

import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, Volume2, ListMusic, Radio, Sparkles } from "lucide-react";
import { AmbientBackground } from "@/components/layout/AmbientBackground";
import { MagneticSeekbar } from "@/components/player/MagneticSeekbar";
import { QueueDrawer } from "@/components/layout/QueueDrawer";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";

// Danh sách nhạc stream trực tiếp từ Google Cloud Storage (100% CORS & Range streaming)
const DEMO_TRACKS = [
  {
    id: "track-1",
    title: "Neverending Story (Lossless Mix)",
    artist: "Kangaroo MusiQue",
    album: "Neon Horizons",
    duration: 215,
    bpm: 128,
    streamUrl: "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverending_Story.mp3",
    coverUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    dominantColors: ["#8A2BE2", "#00F0FF"] as [string, string],
  },
  {
    id: "track-2",
    title: "Sevish Pulse (Microtonal Ambient)",
    artist: "Sevish",
    album: "Obsidian Dreams",
    duration: 184,
    bpm: 110,
    streamUrl: "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Sevish_-__nbsp_.mp3",
    coverUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    dominantColors: ["#FF2A85", "#8A2BE2"] as [string, string],
  },
];

export default function DesktopHome() {
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const { currentTrack, isPlaying, setPlaying, enqueueTrack, advanceNext, advancePrev } = usePlayerStore();
  const { progressMV, seekTo } = useAudioPlayer();

  const handleStartDemo = (track: typeof DEMO_TRACKS[0]) => {
    enqueueTrack(track);
    setPlaying(true);
  };

  return (
    <main className="relative flex h-screen w-screen flex-col justify-between overflow-hidden p-6">
      <AmbientBackground
        primaryColor={currentTrack?.dominantColors[0] || "#8A2BE2"}
        secondaryColor={currentTrack?.dominantColors[1] || "#00F0FF"}
      />

      <header className="glass-panel flex items-center justify-between rounded-2xl px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500/80" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <h1 className="font-display text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neon-cyan" />
            AuraSync Desktop
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <Radio className="h-3 w-3 animate-pulse" />
            Lossless Engine Live
          </span>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto my-6 pr-2">
        <h2 className="font-display text-xl font-bold text-white mb-4">Khám phá Lossless Room</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DEMO_TRACKS.map((t) => (
            <div
              key={t.id}
              onClick={() => handleStartDemo(t)}
              className="glass-panel group flex cursor-pointer items-center gap-4 rounded-2xl p-4 transition duration-300 hover:border-neon-cyan/40 hover:bg-white/10"
            >
              <img src={t.coverUrl} alt={t.title} className="h-16 w-16 rounded-xl object-cover shadow-md" />
              <div className="flex-1 truncate">
                <p className="font-display font-semibold text-white group-hover:text-neon-cyan transition">{t.title}</p>
                <p className="text-xs text-zinc-400">{t.artist} • {t.album}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartDemo(t);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon-cyan text-obsidian-950 shadow-neon-cyan transition hover:scale-110 active:scale-95"
              >
                <Play className="h-4 w-4 fill-current ml-0.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="glass-acrylic flex flex-col gap-2 rounded-2xl px-6 py-3.5 shadow-glass-dock">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-[200px]">
            {currentTrack ? (
              <>
                <img src={currentTrack.coverUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
                <div className="truncate">
                  <p className="truncate text-sm font-semibold text-white">{currentTrack.title}</p>
                  <p className="truncate text-xs text-zinc-400">{currentTrack.artist}</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500">Chưa chọn bài hát</p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button onClick={advancePrev} className="text-zinc-400 hover:text-white transition">
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                if (!currentTrack && DEMO_TRACKS.length > 0) {
                  handleStartDemo(DEMO_TRACKS[0]);
                } else {
                  setPlaying(!isPlaying);
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-obsidian-950 transition hover:scale-105 active:scale-95"
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
            </button>
            <button onClick={advanceNext} className="text-zinc-400 hover:text-white transition">
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition"
            >
              <ListMusic className="h-5 w-5" />
            </button>
          </div>
        </div>

        <MagneticSeekbar progressMV={progressMV} duration={currentTrack?.duration || 0} onSeek={seekTo} />
      </footer>

      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </main>
  );
}
