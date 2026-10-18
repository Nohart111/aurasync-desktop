// src/hooks/useAudioPlayer.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMotionValue } from "framer-motion";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { usePlayerStore } from "@/store/usePlayerStore";

export function useAudioPlayer() {
  const {
    currentTrack,
    nextTrackPreview,
    isPlaying,
    volume,
    setPlaying,
    advanceNext,
  } = usePlayerStore();

  // MotionValue cập nhật ở 60fps không làm React re-render
  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const rafIdRef = useRef<number | null>(null);

  // Vòng lặp 60fps đọc trực tiếp từ AudioEngine
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
    const cleanupEnded = engine.onEnded(() => {
      advanceNext();
    });
    return cleanupEnded;
  }, [advanceNext]);

  // Phát nhạc khi đổi bài
  useEffect(() => {
    if (!currentTrack) return;
    const engine = AudioEngine.getInstance();
    engine
      .loadAndPlay(currentTrack.streamUrl)
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [currentTrack, setPlaying]);

  // Tự động nạp trước bài tiếp theo vào bộ đệm HTTP Range
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    engine.preloadNextTrack(nextTrackPreview?.streamUrl ?? null);
  }, [nextTrackPreview]);

  // Đồng bộ trạng thái Play/Pause và vòng lặp 60fps
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    if (isPlaying) {
      engine.play().catch(() => setPlaying(false));
      rafIdRef.current = requestAnimationFrame(syncFrame);
    } else {
      engine.pause();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying, syncFrame, setPlaying]);

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
    getFrequencyData: () => AudioEngine.getInstance().getFrequencySnapshot(),
  };
}