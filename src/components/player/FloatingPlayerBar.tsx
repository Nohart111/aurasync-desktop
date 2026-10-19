// src/components/player/FloatingPlayerBar.tsx
"use client";

import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { MagneticSeekbar } from "./MagneticSeekbar";
import { SpectrumVisualizer } from "./SpectrumVisualizer";
import { Play, Pause, SkipBack, SkipForward, Volume2, ListMusic } from "lucide-react";

export function FloatingPlayerBar({ onToggleQueue }: { onToggleQueue: () => void }) {
  const {
    currentTrack,
    isPlaying,
    setPlaying,
    advanceNext,
    advancePrev,
    volume,
    setVolume,
    queueItems,
  } = usePlayerStore();

  const { progressMV, seekTo } = useAudioPlayer();

  if (!currentTrack) return null;

  const handleSeek = (targetSeconds: number) => {
    const realDuration = AudioEngine.getInstance().getDuration() || currentTrack.duration || 180;
    const ratio = targetSeconds / (currentTrack.duration || 180);
    seekTo(ratio * realDuration);
  };

  return (
    <footer className="glass-acrylic gpu-accelerated fixed bottom-4 inset-x-6 z-50 flex h-20 items-center justify-between rounded-2xl px-6">
      <div className="flex w-1/4 items-center gap-3.5 overflow-hidden">
        <img
          src={currentTrack.coverUrl}
          alt={currentTrack.title}
          className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-md"
        />
        <div className="truncate">
          <p className="truncate text-sm font-semibold text-white">{currentTrack.title}</p>
          <p className="truncate text-xs text-zinc-400">{currentTrack.artist}</p>
        </div>
      </div>

      <div className="flex w-2/4 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button onClick={advancePrev} className="text-zinc-400 transition hover:text-white">
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={() => setPlaying(!isPlaying)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-neon-cyan transition hover:scale-105"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-black" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-black" />
            )}
          </button>
          <button onClick={advanceNext} className="text-zinc-400 transition hover:text-white">
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        <div className="w-full max-w-md">
          <MagneticSeekbar
            progressMV={progressMV}
            duration={currentTrack.duration || 180}
            onSeek={handleSeek}
          />
        </div>
      </div>

      <div className="flex w-1/4 items-center justify-end gap-4">
        <SpectrumVisualizer />
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-zinc-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="h-1 w-20 cursor-pointer accent-neon-cyan"
          />
        </div>
        <button
          onClick={onToggleQueue}
          className="relative rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <ListMusic className="h-5 w-5" />
          {queueItems.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon-cyan text-[10px] font-bold text-black">
              {queueItems.length}
            </span>
          )}
        </button>
      </div>
    </footer>
  );
}