'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMotionValue } from 'framer-motion';
import { AudioEngine } from '@/core/audio/AudioEngine';
import { usePlayerStore } from '@/store/usePlayerStore';

export function useAudioPlayer() {
  const {
    currentTrack,
    nextTrackPreview,
    isPlaying,
    volume,
    setPlaying,
    advanceNext,
  } = usePlayerStore();

  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [actualDuration, setActualDuration] = useState(0);

  const rafIdRef = useRef<number | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const lastSecondRef = useRef<number>(-1);

  const syncFrame = useCallback(() => {
    const engine = AudioEngine.getInstance();
    const current = engine.getCurrentTime();
    const total = engine.getDuration() || currentTrack?.duration || 0;

    currentTimeMV.set(current);
    progressMV.set(total > 0 ? current / total : 0);

    const floored = Math.floor(current);
    if (floored !== lastSecondRef.current) {
      lastSecondRef.current = floored;
      setCurrentTime(floored);
    }

    if (total > 0 && Math.abs(total - actualDuration) > 1) {
      setActualDuration(total);
    }

    rafIdRef.current = requestAnimationFrame(syncFrame);
  }, [currentTimeMV, progressMV, currentTrack?.duration, actualDuration]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const cleanupEnded = engine.onEnded(() => {
      advanceNext();
    });
    const cleanupMeta = engine.onMetadataLoaded((dur) => {
      if (dur > 0) setActualDuration(dur);
    });
    return () => {
      cleanupEnded();
      cleanupMeta();
    };
  }, [advanceNext]);

  useEffect(() => {
    if (!currentTrack) return;
    const rawUrl = (currentTrack as any).streamUrl || (currentTrack as any).cdnUrl || '';
    if (!rawUrl) {
      console.warn('Bài hát chưa có streamUrl:', currentTrack.title);
      setPlaying(false);
      return;
    }

    const engine = AudioEngine.getInstance();
    const isNewTrack = lastTrackIdRef.current !== currentTrack.id;
    lastTrackIdRef.current = currentTrack.id;

    if (isNewTrack) {
      setCurrentTime(0);
      setActualDuration(currentTrack.duration || 0);
      engine
        .loadAndPlay(rawUrl)
        .then(() => {
          setPlaying(true);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.error('Không thể phát luồng nhạc:', err);
            setPlaying(false);
          }
        });
    }
  }, [currentTrack, setPlaying]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    const nextUrl = (nextTrackPreview as any)?.streamUrl || (nextTrackPreview as any)?.cdnUrl || null;
    engine.preloadNextTrack(nextUrl);
  }, [nextTrackPreview]);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    if (isPlaying) {
      if (currentTrack && lastTrackIdRef.current === currentTrack.id) {
        engine.play().catch((err) => {
          if (err?.name !== 'AbortError') setPlaying(false);
        });
      }
      rafIdRef.current = requestAnimationFrame(syncFrame);
    } else {
      engine.pause();
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying, syncFrame, setPlaying, currentTrack]);

  useEffect(() => {
    AudioEngine.getInstance().setVolume(volume);
  }, [volume]);

  const seekTo = useCallback(
    (seconds: number) => {
      AudioEngine.getInstance().seek(seconds);
      setCurrentTime(Math.floor(seconds));
      currentTimeMV.set(seconds);
      const total = AudioEngine.getInstance().getDuration() || currentTrack?.duration || 180;
      if (total > 0) progressMV.set(seconds / total);
    },
    [currentTimeMV, progressMV, currentTrack?.duration]
  );

  return {
    progressMV,
    currentTimeMV,
    currentTime,
    actualDuration,
    seekTo,
    getFrequencyData: () => AudioEngine.getInstance().getFrequencySnapshot(),
  };
}
