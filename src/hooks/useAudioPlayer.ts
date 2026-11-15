'use client';

import { useEffect, useRef, useCallback } from 'react';
import { motionValue } from 'framer-motion';
import { usePlayerStore } from '@/store/usePlayerStore';
import { AudioEngine, audioEngine } from '@/core/audio/AudioEngine';
import { fetchCatalog } from '@/lib/catalog-client';
import {
  initYouTubePreviewBridge,
  pauseYouTubePreview,
  resumeYouTubePreview,
  seekYouTubePreview,
  setYouTubePreviewVolume,
  stopYouTubePreview,
} from '@/components/player/YouTubePreviewBridge';

let initialCatalogSynced = false;
let lastRecordedStreamSessionKey = '';

const FALLBACK_ARTWORK_URL =
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512&auto=format&fit=crop&q=80';

export function resolveStreamUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('yt-preview:')) return rawUrl;
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
 * Chuẩn quốc tế (Spotify / Apple Music Standard):
 * Khi bài hát phát vượt qua mốc 30 giây, ghi nhận +1 lượt stream hợp lệ cho phiên phát đó.
 */
function checkAndRecord30sStream(currentTimeSec: number) {
  const state = usePlayerStore.getState();
  const track = state.currentTrack;
  if (!track || !track.id || !state.isPlaying) return;

  const threshold = track.duration && track.duration < 60 ? Math.max(10, track.duration * 0.5) : 30;
  if (currentTimeSec >= threshold) {
    const sessionKey = `${track.id}-${state.playNonce}`;
    if (lastRecordedStreamSessionKey !== sessionKey) {
      lastRecordedStreamSessionKey = sessionKey;
      state.recordTrackStream(track.id);
      if (track.videoId && track.videoId !== track.id) {
        state.recordTrackStream(track.videoId);
      }
    }
  }
}

function triggerImmediateSyncPlaybackFromStore() {
  const nextState = usePlayerStore.getState();
  const nextTrack = nextState.currentTrack;
  if (nextTrack && nextState.isPlaying && !nextTrack.isPreview) {
    const rawUrl = nextTrack.streamUrl || nextTrack.cdnUrl || '';
    const streamUrl = resolveStreamUrl(rawUrl);
    if (streamUrl && !streamUrl.startsWith('yt-preview:')) {
      void audioEngine.loadAndPlay(streamUrl, nextState.playNonce);
    }
  }
}

/**
 * Playback position shared by every component. Written only by the single
 * PlaybackController (once per frame while playing), read through motion
 * values so the UI updates without React re-renders.
 */
const currentTimeMV = motionValue(0);
const progressMV = motionValue(0);

function setPosition(current: number, total: number) {
  currentTimeMV.set(current);
  progressMV.set(total > 0 ? Math.min(1, Math.max(0, current / total)) : 0);
}

/**
 * Owns all playback side effects: catalog sync, the audio engine wiring, track
 * loading, Media Session and the position loop. Mount exactly once (see
 * PlaybackController); components use the lightweight useAudioPlayer instead.
 */
export function usePlaybackController() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const nextTrackPreview = usePlayerStore((s) => s.nextTrackPreview);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const playNonce = usePlayerStore((s) => s.playNonce);
  const setDuration = usePlayerStore((s) => s.setDuration);

  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    initYouTubePreviewBridge();

    const syncCatalogToStore = async (fresh = false) => {
      try {
        const list = await fetchCatalog({ fresh });
        if (list.length > 0) {
          usePlayerStore.getState().setLibrary(list);
        }
      } catch {}
    };

    if (!initialCatalogSynced) {
      initialCatalogSynced = true;
      syncCatalogToStore();
    }

    const onTrackAdded = () => {
      void syncCatalogToStore(true);
    };
    window.addEventListener('aurasound:track-added', onTrackAdded);
    return () => window.removeEventListener('aurasound:track-added', onTrackAdded);
  }, []);

  useEffect(() => {
    // Pushes playback position into motion values once per frame while playing.
    const syncFrame = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        rafIdRef.current = null;
        return;
      }

      const storeState = usePlayerStore.getState();
      const isPreviewMode = Boolean(storeState.currentTrack?.isPreview);

      const current = isPreviewMode
        ? storeState.progress || 0
        : audioEngine.getCurrentTime();
      const total = isPreviewMode
        ? storeState.duration || storeState.currentTrack?.duration || 0
        : audioEngine.getDuration() ||
          storeState.duration ||
          storeState.currentTrack?.duration ||
          0;

      if (isPreviewMode) {
        checkAndRecord30sStream(current);
      }

      setPosition(current, total);

      rafIdRef.current = requestAnimationFrame(syncFrame);
    };

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
  }, [isPlaying]);

  // Keep the shared position in sync with store changes (seek, track change, pause).
  useEffect(() => {
    const initial = usePlayerStore.getState();
    setPosition(initial.progress, initial.duration || initial.currentTrack?.duration || 0);
    return usePlayerStore.subscribe((s, prev) => {
      if (s.progress === prev.progress && s.duration === prev.duration && s.currentTrack === prev.currentTrack) return;
      setPosition(s.progress, s.duration || s.currentTrack?.duration || 0);
    });
  }, []);

  useEffect(() => {
    audioEngine.onTimeUpdate((time) => {
      const state = usePlayerStore.getState();
      if (state.currentTrack?.isPreview) return;
      state.setProgress(time);
      checkAndRecord30sStream(time);
      const total = audioEngine.getDuration() || state.duration || state.currentTrack?.duration || 0;
      updateMediaSessionPosition(time, total);
    });

    audioEngine.onDurationChange((dur) => {
      const state = usePlayerStore.getState();
      if (state.currentTrack?.isPreview) return;
      if (dur && !isNaN(dur) && isFinite(dur)) {
        state.setDuration(dur);
        updateMediaSessionPosition(audioEngine.getCurrentTime(), dur);
      }
    });

    audioEngine.onPlayStateChange((playing) => {
      const state = usePlayerStore.getState();
      if (state.currentTrack?.isPreview) return;
      if (state.isPlaying !== playing) {
        state.setIsPlaying(playing);
      }
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
        } catch {}
      }
    });

    audioEngine.onEnded(() => {
      usePlayerStore.getState().advanceNext('ended');
      triggerImmediateSyncPlaybackFromStore();
    });

    audioEngine.onCrossfade(() => {
      usePlayerStore.getState().advanceNext('crossfade');
      triggerImmediateSyncPlaybackFromStore();
    });

    audioEngine.onPlaybackStatus((status) => {
      const state = usePlayerStore.getState();
      if (!state.currentTrack?.isPreview) state.setPlaybackStatus(status);
    });

    audioEngine.onError(() => {
      const state = usePlayerStore.getState();
      if (state.currentTrack?.isPreview) return;
      state.setPlaybackStatus('error');
      state.setIsPlaying(false);
    });
  }, []);

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
      if (state.currentTrack?.isPreview) {
        resumeYouTubePreview();
        return;
      }
      const rawUrl = state.currentTrack?.streamUrl || state.currentTrack?.cdnUrl || '';
      const streamUrl = resolveStreamUrl(rawUrl);
      void audioEngine.play(streamUrl, state.playNonce);
    });

    safeSetHandler('pause', () => {
      const state = usePlayerStore.getState();
      state.setIsPlaying(false);
      if (state.currentTrack?.isPreview) {
        pauseYouTubePreview();
        return;
      }
      audioEngine.pause();
    });

    safeSetHandler('previoustrack', () => {
      stopYouTubePreview();
      usePlayerStore.getState().playPrevious();
      triggerImmediateSyncPlaybackFromStore();
    });

    safeSetHandler('nexttrack', () => {
      stopYouTubePreview();
      usePlayerStore.getState().playNext();
      triggerImmediateSyncPlaybackFromStore();
    });

    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number' && !isNaN(details.seekTime)) {
        const state = usePlayerStore.getState();
        if (state.currentTrack?.isPreview) {
          seekYouTubePreview(details.seekTime);
        } else {
          audioEngine.seek(details.seekTime);
        }
        state.setProgress(details.seekTime);
        const total =
          audioEngine.getDuration() ||
          state.duration ||
          state.currentTrack?.duration ||
          0;
        updateMediaSessionPosition(details.seekTime, total);
      }
    });

    safeSetHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      const state = usePlayerStore.getState();
      const baseTime = state.currentTrack?.isPreview ? state.progress : audioEngine.getCurrentTime();
      const total =
        audioEngine.getDuration() ||
        state.duration ||
        state.currentTrack?.duration ||
        0;
      const target = Math.max(0, baseTime - offset);
      if (state.currentTrack?.isPreview) {
        seekYouTubePreview(target);
      } else {
        audioEngine.seek(target);
      }
      state.setProgress(target);
      updateMediaSessionPosition(target, total);
    });

    safeSetHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      const state = usePlayerStore.getState();
      const baseTime = state.currentTrack?.isPreview ? state.progress : audioEngine.getCurrentTime();
      const total =
        audioEngine.getDuration() ||
        state.duration ||
        state.currentTrack?.duration ||
        0;
      const target = total > 0 ? Math.min(total, baseTime + offset) : baseTime + offset;
      if (state.currentTrack?.isPreview) {
        seekYouTubePreview(target);
      } else {
        audioEngine.seek(target);
      }
      state.setProgress(target);
      updateMediaSessionPosition(target, total);
    });

    safeSetHandler('stop', () => {
      stopYouTubePreview();
      audioEngine.pause();
      audioEngine.seek(0);
      const state = usePlayerStore.getState();
      state.setIsPlaying(false);
      state.setProgress(0);
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch {}
    });

    return () => {
      safeSetHandler('play', null);
      safeSetHandler('pause', null);
      safeSetHandler('previoustrack', null);
      safeSetHandler('nexttrack', null);
      safeSetHandler('seekto', null);
      safeSetHandler('seekbackward', null);
      safeSetHandler('seekforward', null);
      safeSetHandler('stop', null);
    };
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!currentTrack) {
      audioEngine.pause();
      stopYouTubePreview();
      usePlayerStore.getState().setPlaybackStatus('idle');
      return;
    }

    const rawUrl = currentTrack.streamUrl || currentTrack.cdnUrl || '';

    if (currentTrack.isPreview || rawUrl.startsWith('yt-preview:')) {
      audioEngine.pause();
      if (currentTrack.duration && currentTrack.duration > 0) {
        setDuration(currentTrack.duration);
      }
      if (isPlaying) {
        resumeYouTubePreview();
      } else {
        pauseYouTubePreview();
      }
      return;
    }

    stopYouTubePreview();

    const streamUrl = resolveStreamUrl(rawUrl);
    if (!streamUrl) {
      usePlayerStore.getState().setPlaybackStatus('error');
      usePlayerStore.getState().setIsPlaying(false);
      return;
    }

    if (currentTrack.duration && currentTrack.duration > 0) {
      setDuration(currentTrack.duration);
    }

    if (isPlaying) {
      void audioEngine.loadAndPlay(streamUrl, playNonce);
    } else {
      audioEngine.pause();
      const state = usePlayerStore.getState();
      if (state.playbackStatus !== 'error') state.setPlaybackStatus('paused');
    }
  }, [currentTrack, isPlaying, playNonce, setDuration]);

  useEffect(() => {
    if (nextTrackPreview && !nextTrackPreview.isPreview) {
      const nextRaw = nextTrackPreview.streamUrl || nextTrackPreview.cdnUrl || '';
      const nextUrl = resolveStreamUrl(nextRaw);
      if (nextUrl) {
        audioEngine.preloadNextTrack(nextUrl);
      }
    }
  }, [nextTrackPreview]);

  const crossfadeDuration = usePlayerStore((s) => s.crossfadeDuration);
  const stereoWidth = usePlayerStore((s) => s.stereoWidth);
  const isSpatialAudioEnabled = usePlayerStore((s) => s.isSpatialAudioEnabled);
  const eqGains = usePlayerStore((s) => s.eqGains);
  const isEqBypassed = usePlayerStore((s) => s.isEqBypassed);

  useEffect(() => {
    audioEngine.setAllEqGains(eqGains);
    audioEngine.setEqBypassed(isEqBypassed);
  }, [eqGains, isEqBypassed]);

  useEffect(() => {
    audioEngine.setCrossfadeSec(crossfadeDuration);
  }, [crossfadeDuration]);

  useEffect(() => {
    audioEngine.setStereoWidth(stereoWidth);
    audioEngine.setSpatialAudioEnabled(isSpatialAudioEnabled);
  }, [stereoWidth, isSpatialAudioEnabled]);

  useEffect(() => {
    audioEngine.setVolume(volume);
    setYouTubePreviewVolume(volume);
  }, [volume]);

}

/** Renders nothing; mounts the playback controller once for the whole app. */
export function PlaybackController() {
  usePlaybackController();
  return null;
}

function seekTo(seconds: number) {
  const targetSec = typeof seconds === 'number' && !isNaN(seconds) ? seconds : 0;
  const state = usePlayerStore.getState();
  if (state.currentTrack?.isPreview) {
    seekYouTubePreview(targetSec);
  } else {
    audioEngine.seek(targetSec);
  }
  state.setProgress(targetSec);
  const total = audioEngine.getDuration() || state.duration || state.currentTrack?.duration || 0;
  setPosition(targetSec, total);
  updateMediaSessionPosition(targetSec, total);
}

/** Current playback position in seconds, read on demand (no subscription). */
export function getPlaybackTime(): number {
  return currentTimeMV.get();
}

/**
 * Lightweight playback API for components. Re-renders only when the track
 * duration changes; position is exposed as motion values.
 */
export function useAudioPlayer() {
  const duration = usePlayerStore((s) => s.duration);
  const trackDuration = usePlayerStore((s) => s.currentTrack?.duration);
  const togglePlay = useCallback(() => usePlayerStore.getState().togglePlay(), []);
  const finalDuration = duration || trackDuration || 0;

  return {
    currentTimeMV,
    progressMV,
    duration: finalDuration,
    actualDuration: finalDuration,
    togglePlay,
    seek: seekTo,
    seekTo,
    getCurrentTime: getPlaybackTime,
    getFrequencyData: () => AudioEngine.getInstance().getFrequencySnapshot(),
  };
}

export default useAudioPlayer;
