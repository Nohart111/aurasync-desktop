'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { Track } from '@/store/usePlayerStore';
import { AudioEngine } from '@/core/audio/AudioEngine';

// ============================================================================
// SINGLETON YOUTUBE IFRAME AUDIO BRIDGE (PRE-WARMED INSTANT PREVIEW ~1S)
// - Kết nối chính ngạch tới Google Global Cache CDN thông qua YouTube IFrame API
// - Tự động ngắt chéo 2 chiều (Mutual Exclusion) với AudioEngine để không bao giờ chồng âm thanh
// - Đồng bộ thanh tiến trình, Play/Pause, Seek và Volume trực tiếp lên FloatingPlayerBar
// ============================================================================

let ytPlayer: any = null;
let isYtApiReady = false;
let isInitializing = false;
let pendingVideoId: string | null = null;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let activePreviewVideoId: string | null = null;

function clearProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function startProgressTimer() {
  clearProgressTimer();
  progressTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    try {
      const state = usePlayerStore.getState();
      if (!state.currentTrack?.isPreview || !state.isPlaying) return;

      const curr = ytPlayer.getCurrentTime() || 0;
      const dur = ytPlayer.getDuration() || 0;
      if (curr >= 0) {
        state.setProgress(curr);
      }
      if (dur > 0 && isFinite(dur) && Math.abs((state.duration || 0) - dur) > 1) {
        state.setDuration(dur);
      }
    } catch {}
  }, 250);
}

function ensureYouTubeContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let wrapper = document.getElementById('aurasound-yt-bridge-wrapper');
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.id = 'aurasound-yt-bridge-wrapper';
    wrapper.style.position = 'fixed';
    wrapper.style.bottom = '0px';
    wrapper.style.right = '0px';
    wrapper.style.width = '1px';
    wrapper.style.height = '1px';
    wrapper.style.opacity = '0.001';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '-50';
    wrapper.style.overflow = 'hidden';

    const inner = document.createElement('div');
    inner.id = 'youtube-preview-player';
    wrapper.appendChild(inner);
    document.body.appendChild(wrapper);
  }
  return document.getElementById('youtube-preview-player');
}

export function initYouTubePreviewBridge() {
  if (typeof window === 'undefined') return;

  (window as any).__AURASOUND_STOP_YT_PREVIEW__ = stopYouTubePreview;

  ensureYouTubeContainer();

  if (ytPlayer || isInitializing) return;

  const createPlayerInstance = () => {
    const YT = (window as any).YT;
    if (!YT || !YT.Player || ytPlayer) return;
    ensureYouTubeContainer();
    isInitializing = true;

    try {
      ytPlayer = new YT.Player('youtube-preview-player', {
        width: '200',
        height: '200',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            isYtApiReady = true;
            isInitializing = false;
            const vol = usePlayerStore.getState().volume ?? 0.8;
            try {
              event.target.setVolume(Math.round(vol * 100));
            } catch {}

            if (pendingVideoId) {
              const vid = pendingVideoId;
              pendingVideoId = null;
              try {
                event.target.loadVideoById({ videoId: vid, suggestedQuality: 'small' });
                event.target.playVideo();
                startProgressTimer();
              } catch {}
            }
          },
          onStateChange: (event: any) => {
            const YTState = (window as any).YT?.PlayerState;
            if (!YTState) return;
            const store = usePlayerStore.getState();
            if (!store.currentTrack?.isPreview) return;

            if (event.data === YTState.PLAYING) {
              const dur = event.target.getDuration?.() || 0;
              if (dur > 0) store.setDuration(dur);
              if (!store.isPlaying) store.setIsPlaying(true);
              startProgressTimer();
            } else if (event.data === YTState.PAUSED) {
              if (store.isPlaying) store.setIsPlaying(false);
              clearProgressTimer();
            } else if (event.data === YTState.ENDED) {
              clearProgressTimer();
              store.setIsPlaying(false);
              store.setProgress(0);
            }
          },
          onError: () => {
            clearProgressTimer();
          },
        },
      });
    } catch {
      isInitializing = false;
    }
  };

  if ((window as any).YT && (window as any).YT.Player) {
    createPlayerInstance();
    return;
  }

  const prevCallback = (window as any).onYouTubeIframeAPIReady;
  (window as any).onYouTubeIframeAPIReady = () => {
    if (typeof prevCallback === 'function') prevCallback();
    createPlayerInstance();
  };

  if (!document.getElementById('aurasound-yt-iframe-script')) {
    const tag = document.createElement('script');
    tag.id = 'aurasound-yt-iframe-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  }
}

export function playYouTubePreview(item: {
  id: string;
  videoId?: string;
  title: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
  url?: string;
}) {
  if (typeof window === 'undefined') return;
  const videoId = item.videoId || item.id;
  if (!videoId) return;

  const store = usePlayerStore.getState();

  // Nếu đang nghe thử đúng bài này -> Toggle Play / Pause tức thì
  if (
    store.currentTrack?.isPreview &&
    (store.currentTrack.videoId === videoId || store.currentTrack.id === `preview-${videoId}`)
  ) {
    if (store.isPlaying) {
      pauseYouTubePreview();
    } else {
      resumeYouTubePreview();
    }
    return;
  }

  // 1. Dừng ngay lập tức AudioEngine (nhạc kho CDN) để tuyệt đối không chồng âm thanh
  try {
    AudioEngine.getInstance().pause();
  } catch {}

  activePreviewVideoId = videoId;

  // 2. Đưa thông tin bài nghe thử lên thanh điều khiển FloatingPlayerBar
  const previewTrack: Track = {
    id: `preview-${videoId}`,
    videoId,
    title: item.title,
    artist: item.artist || 'Nghệ sĩ chưa rõ',
    duration: item.duration || 240,
    coverUrl: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    streamUrl: `yt-preview:${videoId}`,
    album: 'YouTube Preview',
    isPreview: true,
  };

  store.setCurrentTrack(previewTrack);

  // 3. Kích hoạt phát ngay trên IFrame đã khởi tạo sẵn (Pre-warmed)
  initYouTubePreviewBridge();

  if (isYtApiReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    try {
      const vol = store.volume ?? 0.8;
      ytPlayer.setVolume?.(Math.round(vol * 100));
      ytPlayer.loadVideoById({ videoId, suggestedQuality: 'small' });
      ytPlayer.playVideo?.();
      startProgressTimer();
    } catch {
      pendingVideoId = videoId;
    }
  } else {
    pendingVideoId = videoId;
  }
}

export function pauseYouTubePreview() {
  clearProgressTimer();
  const store = usePlayerStore.getState();
  if (store.currentTrack?.isPreview && store.isPlaying) {
    store.setIsPlaying(false);
  }
  if (isYtApiReady && ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    try {
      ytPlayer.pauseVideo();
    } catch {}
  }
}

export function resumeYouTubePreview() {
  const store = usePlayerStore.getState();
  if (store.currentTrack?.isPreview && !store.isPlaying) {
    store.setIsPlaying(true);
  }
  if (isYtApiReady && ytPlayer && typeof ytPlayer.playVideo === 'function') {
    try {
      ytPlayer.playVideo();
      startProgressTimer();
    } catch {}
  } else if (activePreviewVideoId) {
    pendingVideoId = activePreviewVideoId;
    initYouTubePreviewBridge();
  }
}

export function seekYouTubePreview(seconds: number) {
  if (isYtApiReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(seconds, true);
    } catch {}
  }
}

export function setYouTubePreviewVolume(vol: number) {
  if (isYtApiReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
    try {
      ytPlayer.setVolume(Math.round(Math.max(0, Math.min(1, vol)) * 100));
    } catch {}
  }
}

export function stopYouTubePreview() {
  clearProgressTimer();
  pendingVideoId = null;
  activePreviewVideoId = null;
  if (isYtApiReady && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
    try {
      ytPlayer.stopVideo();
    } catch {}
  }
}

export function YouTubePreviewBridge() {
  useEffect(() => {
    initYouTubePreviewBridge();
  }, []);

  return null;
}

export default YouTubePreviewBridge;
