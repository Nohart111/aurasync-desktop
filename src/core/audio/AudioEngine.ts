/**
 * Singleton Web Audio & HTML5 Audio Engine
 * - Guarantees a single active ended/timeupdate listener even when multiple components call useAudioPlayer()
 * - Prevents duplicate loadAndPlay restarts when multiple hook instances run in the same render pass
 * - Exposes window.__AURASOUND_ANALYSER__ for 60fps Canvas Spectrum & 24-LED Studio VU Meter
 * - Supports instant replay on 1-track playlists via playNonce
 */
export class AudioEngine {
  private static instance: AudioEngine;
  private primaryAudio: HTMLAudioElement | null = null;
  private preloadAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(64);

  private currentUrl: string = '';
  private currentNonce: number = -1;
  private isLoading: boolean = false;
  private activeLoadId: number = 0;
  private endedFiredForLoad: boolean = false;

  // Single replaceable callbacks to prevent duplicate event listener stacking across multiple hook instances
  private timeUpdateCallback: ((time: number) => void) | null = null;
  private durationChangeCallback: ((duration: number) => void) | null = null;
  private endedCallback: (() => void) | null = null;
  private errorCallback: ((err: string) => void) | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.primaryAudio = new Audio();
      this.primaryAudio.crossOrigin = 'anonymous';
      this.primaryAudio.preload = 'auto';

      this.preloadAudio = new Audio();
      this.preloadAudio.crossOrigin = 'anonymous';
      this.preloadAudio.preload = 'auto';

      this.bindNativeEvents();

      // Unlock AudioContext on any user interaction
      const unlock = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private bindNativeEvents(): void {
    if (!this.primaryAudio) return;

    this.primaryAudio.addEventListener('timeupdate', () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended' && !this.primaryAudio?.paused) {
        this.audioCtx.resume().catch(() => {});
      }
      if (this.primaryAudio && this.timeUpdateCallback) {
        this.timeUpdateCallback(this.primaryAudio.currentTime || 0);
      }
    });

    this.primaryAudio.addEventListener('loadedmetadata', () => {
      if (this.primaryAudio && this.durationChangeCallback) {
        const dur = this.primaryAudio.duration;
        if (dur && !isNaN(dur) && isFinite(dur)) {
          this.durationChangeCallback(dur);
        }
      }
    });

    this.primaryAudio.addEventListener('durationchange', () => {
      if (this.primaryAudio && this.durationChangeCallback) {
        const dur = this.primaryAudio.duration;
        if (dur && !isNaN(dur) && isFinite(dur)) {
          this.durationChangeCallback(dur);
        }
      }
    });

    this.primaryAudio.addEventListener('ended', () => {
      if (this.endedFiredForLoad) return;
      this.endedFiredForLoad = true;
      this.isLoading = false;
      if (this.endedCallback) {
        this.endedCallback();
      }
    });
  }

  private ensureAudioContext(): void {
    if (typeof window === 'undefined' || !this.primaryAudio) return;
    try {
      if (!this.audioCtx) {
        const AudioContextClass =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.82;
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        this.gainNode = this.audioCtx.createGain();
        this.sourceNode = this.audioCtx.createMediaElementSource(this.primaryAudio);

        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        (window as any).__AURASOUND_ANALYSER__ = this.analyser;
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    } catch {
      // Fallback gracefully to standard HTML5 Audio playback if WebAudio fails
    }
  }

  public async loadAndPlay(url: string, nonce?: number): Promise<void> {
    if (!this.primaryAudio || !url) return;

    const isSameUrl = this.currentUrl === url && Boolean(this.primaryAudio.src);
    const isNewNonce = typeof nonce === 'number' && nonce !== this.currentNonce;

    // Prevent duplicate loadAndPlay calls from multiple mounted useAudioPlayer() hooks
    if (isSameUrl && !isNewNonce) {
      if (this.isLoading || (!this.primaryAudio.paused && !this.primaryAudio.ended)) {
        return;
      }
      // Same track was paused -> simply resume from current position
      this.endedFiredForLoad = false;
      this.ensureAudioContext();
      try {
        await this.primaryAudio.play();
      } catch (err: any) {
        if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
          console.warn('AudioEngine resume error:', err?.message || err);
        }
      }
      return;
    }

    const loadId = ++this.activeLoadId;
    this.endedFiredForLoad = false;
    this.isLoading = true;

    try {
      if (!isSameUrl) {
        this.primaryAudio.pause();
        this.primaryAudio.src = url;
        this.currentUrl = url;
        this.primaryAudio.load();
      } else {
        // Same URL but new playNonce (e.g., 1-track playlist replay, Repeat One, or Previous > 3s)
        this.primaryAudio.currentTime = 0;
      }

      if (typeof nonce === 'number') {
        this.currentNonce = nonce;
      }

      this.ensureAudioContext();

      if (loadId !== this.activeLoadId) return;

      await this.primaryAudio.play();
      if (loadId === this.activeLoadId) {
        this.isLoading = false;
      }
    } catch (err: any) {
      if (loadId !== this.activeLoadId) return;
      if (this.primaryAudio && this.primaryAudio.hasAttribute('crossorigin')) {
        try {
          this.primaryAudio.removeAttribute('crossorigin');
          this.primaryAudio.load();
          await this.primaryAudio.play();
          return;
        } catch {}
      }
      if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
        return;
      }
      console.warn('AudioEngine loadAndPlay error:', err?.message || err);
      if (this.errorCallback) {
        this.errorCallback(err?.message || 'Audio playback error');
      }
    } finally {
      if (loadId === this.activeLoadId) {
        this.isLoading = false;
      }
    }
  }

  public preloadNextTrack(nextUrl: string | null): void {
    if (!this.preloadAudio || !nextUrl) return;
    try {
      if (this.preloadAudio.src !== nextUrl) {
        this.preloadAudio.src = nextUrl;
      }
    } catch {}
  }

  public async play(fallbackUrl?: string, nonce?: number): Promise<void> {
    if (!this.primaryAudio) return;
    const targetUrl = this.currentUrl || fallbackUrl || '';
    if (!targetUrl) return;

    if (!this.primaryAudio.src || this.currentUrl !== targetUrl) {
      return this.loadAndPlay(targetUrl, nonce);
    }

    if (!this.primaryAudio.paused && !this.primaryAudio.ended) {
      return;
    }

    try {
      this.endedFiredForLoad = false;
      this.ensureAudioContext();
      if (this.primaryAudio.ended) {
        this.primaryAudio.currentTime = 0;
      }
      await this.primaryAudio.play();
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.name !== 'NotAllowedError') {
        console.warn('Play interrupted:', err?.message || err);
      }
    }
  }

  public pause(): void {
    if (!this.primaryAudio) return;
    this.isLoading = false;
    this.primaryAudio.pause();
  }

  public seek(seconds: number): void {
    if (!this.primaryAudio || isNaN(seconds)) return;
    this.endedFiredForLoad = false;
    const dur = this.primaryAudio.duration;
    if (dur && !isNaN(dur) && isFinite(dur)) {
      this.primaryAudio.currentTime = Math.max(0, Math.min(seconds, dur));
    } else {
      this.primaryAudio.currentTime = Math.max(0, seconds);
    }
  }

  public setVolume(vol: number): void {
    if (!this.primaryAudio) return;
    const clamped = Math.max(0, Math.min(1, isNaN(vol) ? 0.8 : vol));
    this.primaryAudio.volume = clamped;
    if (this.gainNode && this.audioCtx) {
      try {
        this.gainNode.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.015);
      } catch {}
    }
  }

  public getCurrentTime(): number {
    return this.primaryAudio ? this.primaryAudio.currentTime || 0 : 0;
  }

  public getDuration(): number {
    if (!this.primaryAudio) return 0;
    const d = this.primaryAudio.duration;
    return isNaN(d) || !isFinite(d) ? 0 : d;
  }

  public getFrequencyData(): Uint8Array {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyData as any);
    }
    return this.frequencyData;
  }

  public getFrequencySnapshot(): Uint8Array {
    return this.getFrequencyData();
  }

  public onTimeUpdate(cb: (time: number) => void): () => void {
    this.timeUpdateCallback = cb;
    return () => {
      if (this.timeUpdateCallback === cb) this.timeUpdateCallback = null;
    };
  }

  public onDurationChange(cb: (duration: number) => void): () => void {
    this.durationChangeCallback = cb;
    return () => {
      if (this.durationChangeCallback === cb) this.durationChangeCallback = null;
    };
  }

  public onEnded(cb: () => void): () => void {
    this.endedCallback = cb;
    return () => {
      if (this.endedCallback === cb) this.endedCallback = null;
    };
  }

  public onError(cb: (err: string) => void): () => void {
    this.errorCallback = cb;
    return () => {
      if (this.errorCallback === cb) this.errorCallback = null;
    };
  }
}

export const audioEngine = AudioEngine.getInstance();
export default AudioEngine;
