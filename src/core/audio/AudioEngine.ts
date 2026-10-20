/**
 * Singleton Web Audio & HTML5 Audio Engine
 * Prevents duplicate event listeners when multiple UI components call useAudioPlayer(),
 * supports instant replay on 1-track playlists via playNonce, and cleans up resources safely.
 */
export class AudioEngine {
  private static instance: AudioEngine;
  private primaryAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(64);
  private currentUrl: string = '';
  private currentNonce: number = -1;

  // Single replaceable callbacks to prevent duplicate event listener stacking across multiple hook instances
  private timeUpdateCallback: ((time: number) => void) | null = null;
  private durationChangeCallback: ((duration: number) => void) | null = null;
  private endedCallback: (() => void) | null = null;
  private errorCallback: ((err: string) => void) | null = null;

  // Guard to prevent firing ended multiple times for the same track playback
  private endedFiredForLoad: boolean = false;
  private activeLoadId: number = 0;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.primaryAudio = new Audio();
      this.primaryAudio.crossOrigin = 'anonymous';
      this.primaryAudio.preload = 'auto';
      this.bindNativeEvents();
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
      if (this.endedCallback) {
        this.endedCallback();
      }
    });
  }

  private initWebAudio(): void {
    if (typeof window === 'undefined' || !this.primaryAudio || this.audioCtx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      this.sourceNode = this.audioCtx.createMediaElementSource(this.primaryAudio);
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch {
      // Fallback gracefully to standard HTML5 Audio playback if WebAudio CORS/context fails
    }
  }

  public async loadAndPlay(url: string, nonce?: number): Promise<void> {
    if (!this.primaryAudio || !url) return;

    const loadId = ++this.activeLoadId;
    this.endedFiredForLoad = false;

    try {
      const isSameUrl = this.currentUrl === url;
      const isNewNonce = typeof nonce === 'number' && nonce !== this.currentNonce;

      if (!isSameUrl) {
        this.primaryAudio.pause();
        this.primaryAudio.src = url;
        this.currentUrl = url;
        this.primaryAudio.load();
      } else if (isNewNonce || this.primaryAudio.ended) {
        // Same track re-selected or replayed (e.g., 1-track playlist or Previous > 3s reset)
        this.primaryAudio.currentTime = 0;
      }

      if (typeof nonce === 'number') {
        this.currentNonce = nonce;
      }

      this.initWebAudio();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }

      if (loadId !== this.activeLoadId) return; // Superseded by a newer rapid Next/Previous click

      await this.primaryAudio.play();
    } catch (err: any) {
      if (loadId !== this.activeLoadId) return;
      // Ignore AbortError caused by rapid track switching
      if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
        return;
      }
      console.warn('AudioEngine play error:', err?.message || err);
      if (this.errorCallback) {
        this.errorCallback(err?.message || 'Audio playback error');
      }
    }
  }

  public async play(): Promise<void> {
    if (!this.primaryAudio || !this.currentUrl) return;
    try {
      this.endedFiredForLoad = false;
      this.initWebAudio();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
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
    this.primaryAudio.volume = Math.max(0, Math.min(1, vol));
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

  /**
   * Frequency snapshot alias for spectrum analyzer / VU meters in page.tsx
   */
  public getFrequencySnapshot(): Uint8Array {
    return this.getFrequencyData();
  }

  /**
   * Registers the single active timeupdate handler (replaces any previous handler
   * so multiple mounted components calling useAudioPlayer never stack duplicate listeners).
   */
  public onTimeUpdate(cb: (time: number) => void): void {
    this.timeUpdateCallback = cb;
  }

  public onDurationChange(cb: (duration: number) => void): void {
    this.durationChangeCallback = cb;
  }

  public onEnded(cb: () => void): void {
    this.endedCallback = cb;
  }

  public onError(cb: (err: string) => void): void {
    this.errorCallback = cb;
  }
}

export const audioEngine = AudioEngine.getInstance();
export default AudioEngine;
