'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMotionValue } from 'framer-motion';
import { usePlayerStore } from '@/store/usePlayerStore';
import { AudioEngine, audioEngine } from '@/core/audio/AudioEngine';

let consecutiveErrorCount = 0;
let initialCatalogSynced = false;

const FALLBACK_ARTWORK_URL =
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512&auto=format&fit=crop&q=80';

export function resolveStreamUrl(rawUrl?: string): string {
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

function resolveAbsoluteArtworkUrl(rawCover?: string): string {
  if (!rawCover || typeof window === 'undefined') {
    return FALLBACK_ARTWORK_URL;
  }
  try {
    return new URL(rawCover, window.location.origin).href;
  } catch {
    return FALLBACK_ARTWORK_URL;
  }
}

function updateMediaSessionPosition(positionSec: number, durationSec: number) {
  if (
    typeof navigator === 'undefined' ||
    !('mediaSession' in navigator) ||
    typeof navigator.mediaSession.setPositionState !== 'function'
  ) {
    return;
  }
  if (!durationSec || !isFinite(durationSec) || durationSec <= 0) return;
  const safePos = Math.max(0, Math.min(positionSec || 0, durationSec));
  try {
    navigator.mediaSession.setPositionState({
      duration: durationSec,
      playbackRate: 1,
      position: safePos,
    });
  } catch {}
}

/**
 * Kích hoạt phát bài hát kế tiếp NGAY LẬP TỨC trong cùng nhịp đồng bộ (synchronous event tick)
 * để iOS Safari không đóng băng Audio Session khi màn hình đang khóa!
 */
function triggerImmediateSyncPlaybackFromStore() {
  const nextState = usePlayerStore.getState();
  const nextTrack = nextState.currentTrack;
  if (nextTrack && nextState.isPlaying) {
    const rawUrl = nextTrack.streamUrl || nextTrack.cdnUrl || '';
    const streamUrl = resolveStreamUrl(rawUrl);
    if (streamUrl) {
      void audioEngine.loadAndPlay(streamUrl, nextState.playNonce);
    }
  }
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

  const progressMV = useMotionValue(0);
  const currentTimeMV = useMotionValue(0);
  const rafIdRef = useRef<number | null>(null);

  // Sync catalog into usePlayerStore on initial load and when new tracks are added
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

    const onTrackAdded = () => {
      syncCatalogToStore();
    };
    window.addEventListener('aurasound:track-added', onTrackAdded);
    return () => window.removeEventListener('aurasound:track-added', onTrackAdded);
  }, []);

  // 60fps loop updating MotionValues for MagneticSeekbar — tự động tạm dừng khi màn hình tắt (document.hidden)
  const syncFrame = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) {
      rafIdRef.current = null;
      return;
    }

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
    const startOrStopRaf = () => {
      const isHidden = typeof document !== 'undefined' && document.hidden;
      if (isPlaying && !isHidden) {
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(syncFrame);
        }
      } else if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    startOrStopRaf();
    document.addEventListener('visibilitychange', startOrStopRaf);

    return () => {
      document.removeEventListener('visibilitychange', startOrStopRaf);
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

  // Register singleton AudioEngine callbacks + synchronous background track hand-off
  useEffect(() => {
    audioEngine.onTimeUpdate((time) => {
      const state = usePlayerStore.getState();
      state.setProgress(time);
      const total = audioEngine.getDuration() || state.duration || state.currentTrack?.duration || 0;
      updateMediaSessionPosition(time, total);
    });

    audioEngine.onDurationChange((dur) => {
      if (dur && !isNaN(dur) && isFinite(dur)) {
        usePlayerStore.getState().setDuration(dur);
        updateMediaSessionPosition(audioEngine.getCurrentTime(), dur);
      }
    });

    // Đồng bộ ngược trạng thái Play/Pause khi bấm từ Màn hình khóa hoặc tai nghe AirPods
    audioEngine.onPlayStateChange((playing) => {
      const state = usePlayerStore.getState();
      if (state.isPlaying !== playing) {
        state.setIsPlaying(playing);
      }
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        } catch {}
      }
    });

    // Chuyển bài đồng bộ ngay lập tức trong cùng event tick để không bị iOS ngắt khi khóa máy
    audioEngine.onEnded(() => {
      consecutiveErrorCount = 0;
      usePlayerStore.getState().advanceNext('ended');
      triggerImmediateSyncPlaybackFromStore();
    });

    audioEngine.onError(() => {
      const state = usePlayerStore.getState();
      const totalTracks = state.queue.length || state.library.length;
      consecutiveErrorCount += 1;
      if (totalTracks > 1 && consecutiveErrorCount < Math.min(totalTracks, 3)) {
        state.advanceNext('error');
        triggerImmediateSyncPlaybackFromStore();
      } else {
        consecutiveErrorCount = 0;
        state.setIsPlaying(false);
      }
    });
  }, []);

  // Tích hợp chuẩn Media Session API cho Màn hình khóa iOS/iPadOS/Android, Dynamic Island & Tai nghe Bluetooth
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    if (currentTrack && typeof MediaMetadata !== 'undefined') {
      const artworkUrl = resolveAbsoluteArtworkUrl(currentTrack.coverUrl || currentTrack.thumbnail);
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title || 'AuraSound Track',
          artist: currentTrack.artist || 'Nghệ sĩ chưa rõ',
          album: currentTrack.album || 'AuraSound Vault',
          artwork: [
            { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '512x512', type: 'image/png' },
          ],
        });
      } catch {}
    }

    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}

    const safeSetHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    safeSetHandler('play', () => {
      const state = usePlayerStore.getState();
      state.setIsPlaying(true);
      const rawUrl = state.currentTrack?.streamUrl || state.currentTrack?.cdnUrl || '';
      const streamUrl = resolveStreamUrl(rawUrl);
      void audioEngine.play(streamUrl, state.playNonce);
    });

    safeSetHandler('pause', () => {
      usePlayerStore.getState().setIsPlaying(false);
      audioEngine.pause();
    });

    safeSetHandler('previoustrack', () => {
      usePlayerStore.getState().playPrevious();
      triggerImmediateSyncPlaybackFromStore();
    });

    safeSetHandler('nexttrack', () => {
      usePlayerStore.getState().playNext();
      triggerImmediateSyncPlaybackFromStore();
    });

    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number' && !isNaN(details.seekTime)) {
        audioEngine.seek(details.seekTime);
        usePlayerStore.getState().setProgress(details.seekTime);
        const total =
          audioEngine.getDuration() ||
          usePlayerStore.getState().duration ||
          usePlayerStore.getState().currentTrack?.duration ||
          0;
        updateMediaSessionPosition(details.seekTime, total);
      }
    });

    safeSetHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      const target = Math.max(0, audioEngine.getCurrentTime() - offset);
      audioEngine.seek(target);
      usePlayerStore.getState().setProgress(target);
    });

    safeSetHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      const total = audioEngine.getDuration() || usePlayerStore.getState().duration || 0;
      const target = total > 0 ? Math.min(total, audioEngine.getCurrentTime() + offset) : audioEngine.getCurrentTime() + offset;
      audioEngine.seek(target);
      usePlayerStore.getState().setProgress(target);
    });
  }, [currentTrack, isPlaying]);

  // Unified single playback synchronization effect
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
      void audioEngine.loadAndPlay(streamUrl, playNonce);
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
      updateMediaSessionPosition(targetSec, total);
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
