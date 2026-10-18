"use client";

import { useEffect, useRef, useCallback } from "react";
import { useMotionValue } from "framer-motion";
import { AudioEngine } from "@/core/audio/AudioEngine";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";
import { usePlayerStore } from "@/store/usePlayerStore";

export function useAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    volume,
    setPlaying,
    setBuffering,
    setDuration,
    advanceNext,
    playTrackNow: selectTrackNow,
  } = usePlayerStore();

  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const rafIdRef = useRef<number | null>(null);
  const lastStreamUrlRef = useRef<string | null>(null);
  const playbackRequestRef = useRef(0);
  const skipNextPlaybackEffectRef = useRef(false);

  const syncFrame = useCallback(() => {
    const updateFrame = () => {
      const engine = AudioEngine.getInstance();
      const current = engine.getCurrentTime();
      const total = engine.getDuration();

      currentTimeMV.set(current);
      progressMV.set(total > 0 ? current / total : 0);

      rafIdRef.current = requestAnimationFrame(updateFrame);
    };

    updateFrame();
  }, [currentTimeMV, progressMV]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const unsubscribeEnded = engine.onEnded(advanceNext);
    const unsubscribeMetadata = engine.onLoadedMetadata(setDuration);
    const unsubscribeBuffering = engine.onBufferingChange(setBuffering);
    const unsubscribeError = engine.onError(() => {
      ++playbackRequestRef.current;
      skipNextPlaybackEffectRef.current = false;
      setBuffering(false);
      setPlaying(false);
      advanceNext();
    });

    return () => {
      unsubscribeEnded();
      unsubscribeMetadata();
      unsubscribeBuffering();
      unsubscribeError();
    };
  }, [advanceNext, setBuffering, setDuration, setPlaying]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();

    if (!currentTrack) {
      ++playbackRequestRef.current;
      lastStreamUrlRef.current = null;
      engine.pause();
      setBuffering(false);
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
      setDuration(currentTrack.duration);
      setBuffering(true);
      engine
        .loadAndPlay(currentTrack.streamUrl)
        .then(() => {
          if (playbackRequestRef.current === requestId) {
            setPlaying(true);
            setBuffering(false);
          }
        })
        .catch((err) => {
          if (playbackRequestRef.current === requestId) {
            console.error("Playback error:", err);
            setBuffering(false);
            setPlaying(false);
          }
        });
    } else {
      if (isPlaying) {
        engine.play().catch((err) => {
          if (playbackRequestRef.current === requestId) {
            console.error("Resume error:", err);
            setBuffering(false);
            setPlaying(false);
          }
        });
      } else {
        engine.pause();
        setBuffering(false);
      }
    }
  }, [currentTrack, isPlaying, setBuffering, setDuration, setPlaying]);

  const startTrackFromGesture = useCallback(
    (track: Track) => {
      const engine = AudioEngine.getInstance();
      const playerState = usePlayerStore.getState();
      if (
        playerState.currentTrack?.id === track.id &&
        playerState.isPlaying
      ) {
        return;
      }
      const requestId = ++playbackRequestRef.current;
      lastStreamUrlRef.current = track.streamUrl;
      skipNextPlaybackEffectRef.current = true;
      setDuration(track.duration);
      setBuffering(true);

      const playPromise = engine.loadAndPlay(track.streamUrl);
      selectTrackNow(track);
      playPromise
        .then(() => {
          if (playbackRequestRef.current === requestId) {
            setPlaying(true);
            setBuffering(false);
          }
        })
        .catch((err) => {
          if (playbackRequestRef.current === requestId) {
            console.error("Playback error:", err);
            setBuffering(false);
            setPlaying(false);
          }
        });
    },
    [selectTrackNow, setBuffering, setDuration, setPlaying]
  );

  const togglePlaybackFromGesture = useCallback(() => {
    const playerState = usePlayerStore.getState();
    const engine = AudioEngine.getInstance();
    const requestId = ++playbackRequestRef.current;

    if (playerState.isPlaying) {
      skipNextPlaybackEffectRef.current = false;
      engine.pause();
      setBuffering(false);
      setPlaying(false);
      return;
    }

    if (!playerState.currentTrack) return;

    skipNextPlaybackEffectRef.current = true;
    setBuffering(true);
    setPlaying(true);
    engine
      .play()
      .then(() => {
        if (playbackRequestRef.current === requestId) setBuffering(false);
      })
      .catch((err) => {
        if (playbackRequestRef.current === requestId) {
          console.error("Resume error:", err);
          setBuffering(false);
          setPlaying(false);
        }
      });
  }, [setBuffering, setPlaying]);

  // Vòng lặp cập nhật tiến trình 60fps
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

  return {
    progressMV,
    currentTimeMV,
    seekTo,
    startTrackFromGesture,
    togglePlaybackFromGesture,
  };
}
