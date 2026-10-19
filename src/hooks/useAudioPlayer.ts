
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue } from "framer-motion";
import { AudioEngine } from "@/core/audio/AudioEngine";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";
import { usePlayerStore } from "@/store/usePlayerStore";

export function useAudioPlayer() {
  const {
    currentTrack,
    nextTrackPreview,
    isPlaying,
    volume,
    setPlaying,
    advanceNext,
    playTrackNow: selectTrackNow,
  } = usePlayerStore();

  const [isBuffering, setIsBuffering] = useState(false);
  const [duration, setDuration] = useState(currentTrack?.duration ?? 0);

  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);

  const rafIdRef = useRef<number | null>(null);
  const lastStreamUrlRef = useRef<string | null>(null);
  const playbackRequestRef = useRef(0);
  const skipNextPlaybackEffectRef = useRef(false);

  const syncFrame = useCallback(() => {
    const engine = AudioEngine.getInstance();

    const current = engine.getCurrentTime();
    const total = engine.getDuration();

    currentTimeMV.set(current);
    progressMV.set(
      total > 0 && Number.isFinite(total)
        ? Math.max(0, Math.min(current / total, 1))
        : 0,
    );

    if (total > 0 && Number.isFinite(total)) {
      setDuration((previous) =>
        Math.abs(previous - total) > 0.05 ? total : previous,
      );
    }

    rafIdRef.current = requestAnimationFrame(syncFrame);
  }, [currentTimeMV, progressMV]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    return engine.onEnded(() => {
      advanceNext();
    });
  }, [advanceNext]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    if (!currentTrack) {
      ++playbackRequestRef.current;

      lastStreamUrlRef.current = null;
      skipNextPlaybackEffectRef.current = false;

      engine.pause();

      setIsBuffering(false);
      setDuration(0);
      currentTimeMV.set(0);
      progressMV.set(0);

      return;
    }

    if (
      skipNextPlaybackEffectRef.current &&
      lastStreamUrlRef.current === currentTrack.streamUrl
    ) {
      skipNextPlaybackEffectRef.current = false;
      return;
    }

    const requestId = ++playbackRequestRef.current;

    if (lastStreamUrlRef.current !== currentTrack.streamUrl) {
      lastStreamUrlRef.current = currentTrack.streamUrl;

      setDuration(currentTrack.duration || 0);
      setIsBuffering(true);

      engine
        .loadAndPlay(currentTrack.streamUrl)
        .then(() => {
          if (playbackRequestRef.current !== requestId) return;

          const actualDuration = engine.getDuration();

          if (actualDuration > 0 && Number.isFinite(actualDuration)) {
            setDuration(actualDuration);
          }

          setPlaying(true);
          setIsBuffering(false);
        })
        .catch((error: unknown) => {
          if (playbackRequestRef.current !== requestId) return;

          console.error("Playback error:", error);
          setIsBuffering(false);
          setPlaying(false);
        });

      return;
    }

    if (isPlaying) {
      engine.play().catch((error: unknown) => {
        if (playbackRequestRef.current !== requestId) return;

        console.error("Resume error:", error);
        setIsBuffering(false);
        setPlaying(false);
      });
    } else {
      engine.pause();
      setIsBuffering(false);
    }
  }, [
    currentTrack,
    isPlaying,
    setPlaying,
    currentTimeMV,
    progressMV,
  ]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    engine.preloadNextTrack(nextTrackPreview?.streamUrl ?? null);
  }, [nextTrackPreview]);

  const startTrackFromGesture = useCallback(
    (track: Track) => {
      const playerState = usePlayerStore.getState();

      if (
        playerState.currentTrack?.id === track.id &&
        playerState.isPlaying
      ) {
        return;
      }

      const engine = AudioEngine.getInstance();
      const requestId = ++playbackRequestRef.current;

      lastStreamUrlRef.current = track.streamUrl;
      skipNextPlaybackEffectRef.current = true;

      setDuration(track.duration || 0);
      setIsBuffering(true);

      const playPromise = engine.loadAndPlay(track.streamUrl);

      selectTrackNow(track);

      playPromise
        .then(() => {
          if (playbackRequestRef.current !== requestId) return;

          const actualDuration = engine.getDuration();

          if (actualDuration > 0 && Number.isFinite(actualDuration)) {
            setDuration(actualDuration);
          }

          setPlaying(true);
          setIsBuffering(false);
        })
        .catch((error: unknown) => {
          if (playbackRequestRef.current !== requestId) return;

          console.error("Playback error:", error);
          setIsBuffering(false);
          setPlaying(false);
        });
    },
    [selectTrackNow, setPlaying],
  );

  const togglePlaybackFromGesture = useCallback(() => {
    const playerState = usePlayerStore.getState();

    if (!playerState.currentTrack) return;

    const engine = AudioEngine.getInstance();
    const requestId = ++playbackRequestRef.current;

    if (playerState.isPlaying) {
      skipNextPlaybackEffectRef.current = false;

      engine.pause();
      setIsBuffering(false);
      setPlaying(false);

      return;
    }

    skipNextPlaybackEffectRef.current = true;

    setIsBuffering(true);
    setPlaying(true);

    engine
      .play()
      .then(() => {
        if (playbackRequestRef.current === requestId) {
          setIsBuffering(false);
        }
      })
      .catch((error: unknown) => {
        if (playbackRequestRef.current !== requestId) return;

        console.error("Resume error:", error);
        setIsBuffering(false);
        setPlaying(false);
      });
  }, [setPlaying]);

  useEffect(() => {
    if (isPlaying) {
      rafIdRef.current = requestAnimationFrame(syncFrame);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, syncFrame]);

  useEffect(() => {
    AudioEngine.getInstance().setVolume(volume);
  }, [volume]);

  const seekTo = useCallback((seconds: number) => {
    AudioEngine.getInstance().seek(seconds);
  }, []);

  const getFrequencyData = useCallback(() => {
    return AudioEngine.getInstance().getFrequencySnapshot();
  }, []);

  return {
    progressMV,
    currentTimeMV,
    duration,
    isBuffering,
    seekTo,
    startTrackFromGesture,
    togglePlaybackFromGesture,
    getFrequencyData,
  };
}
