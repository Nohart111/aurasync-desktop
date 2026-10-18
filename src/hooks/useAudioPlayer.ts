"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMotionValue } from "framer-motion";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { usePlayerStore } from "@/store/usePlayerStore";

export function useAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    volume,
    setPlaying,
    advanceNext,
  } = usePlayerStore();

  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const rafIdRef = useRef<number | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);

  const syncFrame = useCallback(() => {
    const engine = AudioEngine.getInstance();
    const current = engine.getCurrentTime();
    const total = engine.getDuration();

    currentTimeMV.set(current);
    progressMV.set(total > 0 ? current / total : 0);

    rafIdRef.current = requestAnimationFrame(syncFrame);
  }, [currentTimeMV, progressMV]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    return engine.onEnded(() => {
      advanceNext();
    });
  }, [advanceNext]);

  // Quản lý Play / Pause tập trung, tránh xung đột async
  useEffect(() => {
    if (!currentTrack) return;
    const engine = AudioEngine.getInstance();

    if (lastTrackIdRef.current !== currentTrack.id) {
      lastTrackIdRef.current = currentTrack.id;
      engine
        .loadAndPlay(currentTrack.streamUrl)
        .then(() => setPlaying(true))
        .catch((err) => {
          console.error("Playback error:", err);
          setPlaying(false);
        });
    } else {
      if (isPlaying) {
        engine.play().catch((err) => {
          console.error("Resume error:", err);
          setPlaying(false);
        });
      } else {
        engine.pause();
      }
    }
  }, [currentTrack, isPlaying, setPlaying]);

  // Vòng lặp cập nhật tiến trình 60fps
  useEffect(() => {
    if (isPlaying) {
      rafIdRef.current = requestAnimationFrame(syncFrame);
    } else {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying, syncFrame]);

  useEffect(() => {
    AudioEngine.getInstance().setVolume(volume);
  }, [volume]);

  const seekTo = useCallback((seconds: number) => {
    AudioEngine.getInstance().seek(seconds);
  }, []);

  return {
    progressMV,
    currentTimeMV,
    seekTo,
  };
}
