// Ambient types for browser globals this app reads or sets.

/** The subset of the YouTube IFrame Player API that YouTubePreviewBridge uses. */
interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  loadVideoById(options: { videoId: string; suggestedQuality?: string }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTPlayerOptions {
  width?: string;
  height?: string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: YTPlayerEvent) => void;
    onStateChange?: (event: YTPlayerEvent) => void;
    onError?: (event: YTPlayerEvent) => void;
  };
}

interface YTNamespace {
  Player: new (elementId: string | HTMLElement, options: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

interface Window {
  /** Shared analyser from AudioEngine, read by visualizers. */
  __AURASOUND_ANALYSER__?: AnalyserNode;
  /** Set by YouTubePreviewBridge so AudioEngine can stop a preview without importing it. */
  __AURASOUND_STOP_YT_PREVIEW__?: () => void;
  webkitAudioContext?: typeof AudioContext;
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
}
