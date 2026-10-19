
"use client";

import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { MagneticSeekbar } from "./MagneticSeekbar";
import { SpectrumVisualizer } from "./SpectrumVisualizer";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  ListMusic,
} from "lucide-react";

export function FloatingPlayerBar({
  onToggleQueue,
}: {
  onToggleQueue: () => void;
}) {
  const {
    currentTrack,
    isPlaying,
    advanceNext,
    advancePrev,
    volume,
    setVolume,
    queueItems,
  } = usePlayerStore();

  const {
    progressMV,
    currentTimeMV,
    seekTo,
    togglePlaybackFromGesture,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  const trackDuration =
    Number.isFinite(currentTrack.duration) && currentTrack.duration > 0
      ? currentTrack.duration
      : 180;

  const handleSeek = (targetSeconds: number) => {
    const engineDuration = AudioEngine.getInstance().getDuration();

    const realDuration =
      Number.isFinite(engineDuration) && engineDuration > 0
        ? engineDuration
        : trackDuration;

    const ratio = Math.max(
      0,
      Math.min(targetSeconds / trackDuration, 1),
    );

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

        <div className="min-w-0 truncate">
          <p className="truncate text-sm font-semibold text-white">
            {currentTrack.title}
          </p>

          <p className="truncate text-xs text-zinc-400">
            {currentTrack.artist}
          </p>
        </div>
      </div>

      <div className="flex w-2/4 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={advancePrev}
            aria-label="Previous track"
            className="text-zinc-400 transition hover:text-white"
          >
            <SkipBack className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={togglePlaybackFromGesture}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-neon-cyan transition hover:scale-105"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-black" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-black" />
            )}
          </button>

          <button
            type="button"
            onClick={advanceNext}
            aria-label="Next track"
            className="text-zinc-400 transition hover:text-white"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        <div className="w-full max-w-md">
          <MagneticSeekbar
            progressMV={progressMV}
            currentTimeMV={currentTimeMV}
            duration={trackDuration}
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
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) =>
              setVolume(Number(event.target.value))
            }
            aria-label="Volume"
            className="h-1 w-20 cursor-pointer accent-neon-cyan"
          />
        </div>

        <button
          type="button"
          onClick={onToggleQueue}
          aria-label="Toggle queue"
          className="relative rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <ListMusic className="h-5 w-5" />

          {queueItems.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon-cyan text-[10px] font-bold text-black">
              {queueItems.length}
            </span>
          )}
        </button>
      </div>
    </footer>
  );
}
