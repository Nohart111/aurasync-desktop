'use client';

import { useEffect, useCallback } from 'react';
import { usePlayerStore, Track } from '@/store/usePlayerStore';
import { AudioEngine, audioEngine } from '@/core/audio/AudioEngine';

// Module-level singleton state so multiple components calling useAudioPlayer()
// (e.g., RetroCyberDeckPage and FloatingPlayerBar) never trigger duplicate loads or skip 2 tracks.
let lastLoadedTrackKey = '';
let consecutiveErrorCount = 0;

function resolveStreamUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/tracks/stream')) return rawUrl;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return `/api/tracks/stream?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl;
}

export function useAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    volume,
    progress,
    duration,
    playNonce,
    setIsPlaying,
    setVolume,
    setProgress,
    setDuration,
    playNext,
    playPrevious,
  } = usePlayerStore();

  // Register singleton AudioEngine callbacks.
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
      if (totalTracks > 1 && consecutiveErrorCount < totalTracks) {
        state.advanceNext('error');
      } else {
        consecutiveErrorCount = 0;
        state.setIsPlaying(false);
      }
    });
  }, []);

  // Sync track changes and same-track restarts (via playNonce) with AudioEngine
  useEffect(() => {
    if (!currentTrack || !currentTrack.streamUrl) return;

    const streamUrl = resolveStreamUrl(currentTrack.streamUrl);
    const trackKey = `${currentTrack.id}::${playNonce}::${streamUrl}`;

    if (lastLoadedTrackKey !== trackKey) {
      lastLoadedTrackKey = trackKey;
      if (currentTrack.duration && currentTrack.duration > 0) {
        setDuration(currentTrack.duration);
      }
      if (isPlaying) {
        audioEngine.loadAndPlay(streamUrl, playNonce);
      }
    }
  }, [currentTrack, playNonce, isPlaying, setDuration]);

  // Sync play/pause toggle
  useEffect(() => {
    if (!currentTrack || !currentTrack.streamUrl) return;
    const streamUrl = resolveStreamUrl(currentTrack.streamUrl);
    const trackKey = `${currentTrack.id}::${playNonce}::${streamUrl}`;

    if (isPlaying) {
      if (lastLoadedTrackKey !== trackKey) {
        lastLoadedTrackKey = trackKey;
        audioEngine.loadAndPlay(streamUrl, playNonce);
      } else {
        audioEngine.play();
      }
    } else {
      audioEngine.pause();
    }
  }, [isPlaying, currentTrack, playNonce]);

  // Sync volume
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  const togglePlay = useCallback(() => {
    const state = usePlayerStore.getState();
    if (!state.currentTrack) {
      const first = state.queue[0] || state.library[0];
      if (first) {
        state.setCurrentTrack(first);
        return;
      }
    }
    state.setIsPlaying(!state.isPlaying);
  }, []);

  const seek = useCallback(
    (seconds: number) => {
      audioEngine.seek(seconds);
      setProgress(seconds);
    },
    [setProgress]
  );

  const finalDuration = duration || currentTrack?.duration || 0;

  return {
    currentTrack,
    isPlaying,
    volume,
    progress,
    currentTime: progress,
    currentTimeMV: progress,
    progressMV: progress,
    duration: finalDuration,
    actualDuration: finalDuration,
    togglePlay,
    seek,
    seekTo: seek,
    setVolume,
    playNext,
    playPrevious,
  };
}

export default useAudioPlayer;
