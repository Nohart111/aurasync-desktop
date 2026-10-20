'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMotionValue } from 'framer-motion';
import { usePlayerStore } from '@/store/usePlayerStore';
import { AudioEngine, audioEngine } from '@/core/audio/AudioEngine';

let consecutiveErrorCount = 0;
let initialCatalogSynced = false;

function resolveStreamUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/tracks/stream')) return rawUrl;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    if (rawUrl.includes('/releases/download/')) {
      const parts = rawUrl.split('/');
      const filePart = parts[parts.length - 1];
      if (filePart) {
        return `/api/tracks/stream?file=${encodeURIComponent(decodeURIComponent(filePart))}`;
      }
    }
    return `/api/tracks/stream?url=${encodeURIComponent(rawUrl)}`;
  }
  return `/api/tracks/stream?file=${encodeURIComponent(rawUrl)}`;
}

export function useAudioPlayer() {
  const {
    currentTrack,
    nextTrackPreview,
    isPlaying,
    volume,
    progress,
    duration,
    playNonce,
    setVolume,
    setProgress,
    setDuration,
    playNext,
    playPrevious,
  } = usePlayerStore();

  // Real Framer Motion MotionValues required by MagneticSeekbar (0 -> 1 for progressMV, seconds for currentTimeMV)
  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const rafIdRef = useRef<number | null>(null);

  // Sync catalog into usePlayerStore on initial load and when new tracks are added
  // so the queue always contains the full playlist for auto-advance and end-of-playlist shuffle
  useEffect(() => {
    const syncCatalogToStore = async () => {
      try {
        const res = await fetch('/api/tracks/search?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.tracks || [];
          if (list.length > 0) {
            usePlayerStore.getState().setLibrary(list);
          }
        }
      } catch {}
    };

    if (!initialCatalogSynced) {
      initialCatalogSynced = true;
      syncCatalogToStore();
    }

    const onTrackAdded = (e: Event) => {
      const added = (e as CustomEvent)?.detail;
      if (added && added.id) {
        usePlayerStore.getState().setCurrentTrack(added);
      }
      syncCatalogToStore();
    };
    window.addEventListener('aurasound:track-added', onTrackAdded);
    return () => window.removeEventListener('aurasound:track-added', onTrackAdded);
  }, []);

  // 60fps loop updating MotionValues for MagneticSeekbar without triggering React re-renders
  const syncFrame = useCallback(() => {
    const current = audioEngine.getCurrentTime();
    const storeState = usePlayerStore.getState();
    const total =
      audioEngine.getDuration() ||
      storeState.duration ||
      storeState.currentTrack?.duration ||
      0;

    currentTimeMV.set(current);
    progressMV.set(total > 0 ? Math.min(1, Math.max(0, current / total)) : 0);

    rafIdRef.current = requestAnimationFrame(syncFrame);
  }, [currentTimeMV, progressMV]);

  useEffect(() => {
    if (isPlaying) {
      rafIdRef.current = requestAnimationFrame(syncFrame);
    } else if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, syncFrame]);

  // Keep MotionValues in sync when progress changes via seek or track reset
  useEffect(() => {
    const total = duration || currentTrack?.duration || 0;
    currentTimeMV.set(progress);
    progressMV.set(total > 0 ? Math.min(1, Math.max(0, progress / total)) : 0);
  }, [progress, duration, currentTrack, currentTimeMV, progressMV]);

  // Register singleton AudioEngine callbacks
  useEffect(() => {
    audioEngine.onTimeUpdate((time) => {
      usePlayerStore.getState().setProgress(time);
    });

    audioEngine.onDurationChange((dur) => {
      if (dur && !isNaN(dur) && isFinite(dur)) {
        usePlayerStore.getState().setDuration(dur);
      }
    });

    audioEngine.onEnded(() => {
      consecutiveErrorCount = 0;
      usePlayerStore.getState().advanceNext('ended');
    });

    audioEngine.onError(() => {
      const state = usePlayerStore.getState();
      const totalTracks = state.queue.length || state.library.length;
      consecutiveErrorCount += 1;
      if (totalTracks > 1 && consecutiveErrorCount < Math.min(totalTracks, 3)) {
        state.advanceNext('error');
      } else {
        consecutiveErrorCount = 0;
        state.setIsPlaying(false);
      }
    });
  }, []);

  // Unified single playback synchronization effect (eliminates race condition between separate track & play effects)
  useEffect(() => {
    if (!currentTrack) {
      audioEngine.pause();
      return;
    }

    const rawUrl = currentTrack.streamUrl || currentTrack.cdnUrl || '';
    const streamUrl = resolveStreamUrl(rawUrl);
    if (!streamUrl) return;

    if (currentTrack.duration && currentTrack.duration > 0) {
      setDuration(currentTrack.duration);
    }

    if (isPlaying) {
      audioEngine.loadAndPlay(streamUrl, playNonce);
    } else {
      audioEngine.pause();
    }
  }, [currentTrack, isPlaying, playNonce, setDuration]);

  // Preload next track in queue
  useEffect(() => {
    if (nextTrackPreview) {
      const nextRaw = nextTrackPreview.streamUrl || nextTrackPreview.cdnUrl || '';
      const nextUrl = resolveStreamUrl(nextRaw);
      if (nextUrl) {
        audioEngine.preloadNextTrack(nextUrl);
      }
    }
  }, [nextTrackPreview]);

  // Sync volume
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  const togglePlay = useCallback((..._args: any[]) => {
    usePlayerStore.getState().togglePlay();
  }, []);

  const seek = useCallback(
    (seconds?: any, ..._args: any[]) => {
      const targetSec = typeof seconds === 'number' && !isNaN(seconds) ? seconds : 0;
      audioEngine.seek(targetSec);
      setProgress(targetSec);
      const total =
        audioEngine.getDuration() ||
        usePlayerStore.getState().duration ||
        usePlayerStore.getState().currentTrack?.duration ||
        0;
      currentTimeMV.set(targetSec);
      progressMV.set(total > 0 ? Math.min(1, Math.max(0, targetSec / total)) : 0);
    },
    [setProgress, currentTimeMV, progressMV]
  );

  const finalDuration = duration || currentTrack?.duration || 0;

  return {
    currentTrack,
    isPlaying,
    volume,
    progress,
    currentTime: progress,
    currentTimeMV,
    progressMV,
    duration: finalDuration,
    actualDuration: finalDuration,
    togglePlay,
    seek,
    seekTo: seek,
    setVolume,
    playNext,
    playPrevious,
    getFrequencyData: () => AudioEngine.getInstance().getFrequencySnapshot(),
  };
}

export default useAudioPlayer;
