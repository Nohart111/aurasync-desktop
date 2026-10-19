'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMotionValue } from 'framer-motion';
import { usePlayerStore } from '@/store/usePlayerStore';

let globalAudio: HTMLAudioElement | null = null;
let globalAudioCtx: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;

function getAudioSrc(track: any): string {
  if (!track) return '';
  const url = track.streamUrl || track.url || track.audioUrl || track.src || '';
  if (!url) return '';
  if (url.startsWith('/api/tracks/stream') || url.startsWith('blob:') || url.startsWith('/')) {
    return url;
  }
  return `/api/tracks/stream?url=${encodeURIComponent(url)}`;
}

export function useAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    volume,
    setIsPlaying,
  } = usePlayerStore();

  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const [actualDuration, setActualDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!globalAudio) {
      globalAudio = new Audio();
      globalAudio.crossOrigin = 'anonymous';
      globalAudio.preload = 'auto';
    }

    const audio = globalAudio;

    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setActualDuration(audio.duration);
      }
    };

    const handleDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setActualDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (audio) {
        setCurrentTime(audio.currentTime || 0);
      }
    };

    const handleEnded = () => {
      usePlayerStore.getState().advanceNext();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Xử lý nạp và phát khi đổi bài hoặc bấm Play/Pause
  useEffect(() => {
    if (!globalAudio || !currentTrack) return;
    const audio = globalAudio;
    const targetSrc = getAudioSrc(currentTrack);
    if (!targetSrc) return;

    const resolvedTarget = new URL(targetSrc, window.location.origin).href;

    if (audio.src !== resolvedTarget) {
      audio.src = targetSrc;
    }

    if (isPlaying) {
      try {
        if (!globalAudioCtx) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            globalAudioCtx = new AudioContextClass();
            const source = globalAudioCtx.createMediaElementSource(audio);
            globalAnalyser = globalAudioCtx.createAnalyser();
            globalAnalyser.fftSize = 128;
            globalAnalyser.smoothingTimeConstant = 0.82;
            source.connect(globalAnalyser);
            globalAnalyser.connect(globalAudioCtx.destination);
            (window as any).__AURASOUND_ANALYSER__ = globalAnalyser;
          }
        }
        if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
          globalAudioCtx.resume();
        }
      } catch {
        // Đã kết nối audio graph
      }

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          const onCanPlay = () => {
            audio.removeEventListener('canplay', onCanPlay);
            if (usePlayerStore.getState().isPlaying) {
              audio.play().catch(console.error);
            }
          };
          audio.addEventListener('canplay', onCanPlay);
        });
      }
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (globalAudio) {
      globalAudio.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  // Vòng lặp cập nhật Seekbar 60fps
  useEffect(() => {
    const updateProgress = () => {
      if (globalAudio) {
        const cur = globalAudio.currentTime || 0;
        const dur = isFinite(globalAudio.duration) && globalAudio.duration > 0
          ? globalAudio.duration
          : actualDuration || (currentTrack && currentTrack.duration) || 180;

        currentTimeMV.set(cur);
        progressMV.set(dur > 0 ? Math.min(1, cur / dur) : 0);
      }
      rafRef.current = requestAnimationFrame(updateProgress);
    };

    rafRef.current = requestAnimationFrame(updateProgress);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [actualDuration, currentTrack, currentTimeMV, progressMV]);

  const seekTo = useCallback((seconds: number) => {
    if (globalAudio && isFinite(seconds)) {
      globalAudio.currentTime = Math.max(0, seconds);
    }
  }, []);

  // Tính toán thời lượng an toàn, không bao giờ undefined hoặc NaN
  const safeDuration = (isFinite(actualDuration) && actualDuration > 0)
    ? actualDuration
    : ((currentTrack && typeof currentTrack.duration === 'number' && currentTrack.duration > 0)
        ? currentTrack.duration
        : 180);

  return {
    progressMV,
    currentTimeMV,
    currentTime,
    actualDuration: safeDuration,
    duration: safeDuration,
    currentDuration: safeDuration,
    seekTo,
  };
}
