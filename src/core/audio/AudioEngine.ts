export function normalizeAudioStreamUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('/api/tracks/stream')) return trimmed;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (trimmed.includes('/releases/download/')) {
      const parts = trimmed.split('/');
      const filePart = parts[parts.length - 1];
      if (filePart) {
        return `/api/tracks/stream?file=${encodeURIComponent(decodeURIComponent(filePart))}`;
      }
    }
    return `/api/tracks/stream?url=${encodeURIComponent(trimmed)}`;
  }

  return `/api/tracks/stream?file=${encodeURIComponent(trimmed)}`;
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private audioCtx: AudioContext | null = null;
  private primaryAudio: HTMLAudioElement | null = null;
  private preloadAudio: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(64);
  private currentStreamPath: string = '';

  private constructor() {
    if (typeof window !== 'undefined') {
      this.primaryAudio = new Audio();
      this.primaryAudio.crossOrigin = 'anonymous';
      this.primaryAudio.preload = 'auto';

      this.preloadAudio = new Audio();
      this.preloadAudio.crossOrigin = 'anonymous';
      this.preloadAudio.preload = 'auto';
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private ensureAudioContext(): void {
    if (typeof window === 'undefined' || !this.primaryAudio) return;

    if (!this.audioCtx) {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
        this.sourceNode = this.audioCtx.createMediaElementSource(this.primaryAudio);
        this.gainNode = this.audioCtx.createGain();
        this.analyserNode = this.audioCtx.createAnalyser();

        this.analyserNode.fftSize = 128;
        this.analyserNode.smoothingTimeConstant = 0.82;
        this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);

        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioCtx.destination);

        (window as any).__AURASOUND_ANALYSER__ = this.analyserNode;
      } catch (err) {
        console.warn('Web Audio API Graph init fallback:', err);
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public async loadAndPlay(url: string, startOffsetSeconds = 0): Promise<void> {
    if (!this.primaryAudio) return;
    const safeUrl = normalizeAudioStreamUrl(url);
    if (!safeUrl) {
      throw new Error('Empty stream URL');
    }

    this.ensureAudioContext();

    if (this.currentStreamPath !== safeUrl) {
      this.primaryAudio.pause();
      this.currentStreamPath = safeUrl;
      this.primaryAudio.src = safeUrl;
      this.primaryAudio.load();
    }

    if (startOffsetSeconds > 0) {
      try {
        this.primaryAudio.currentTime = startOffsetSeconds;
      } catch {}
    }

    try {
      await this.primaryAudio.play();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      throw err;
    }
  }

  public preloadNextTrack(nextUrl: string | null): void {
    if (!this.preloadAudio || !nextUrl) return;
    const safeUrl = normalizeAudioStreamUrl(nextUrl);
    if (!safeUrl || this.preloadAudio.src.endsWith(safeUrl)) return;
    this.preloadAudio.src = safeUrl;
  }

  public async play(): Promise<void> {
    if (!this.primaryAudio) return;
    this.ensureAudioContext();
    try {
      await this.primaryAudio.play();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      throw err;
    }
  }

  public pause(): void {
    if (!this.primaryAudio) return;
    this.primaryAudio.pause();
  }

  public seek(seconds: number): void {
    if (!this.primaryAudio) return;
    const dur = this.primaryAudio.duration;
    if (dur && Number.isFinite(dur)) {
      this.primaryAudio.currentTime = Math.max(0, Math.min(seconds, dur));
    } else {
      this.primaryAudio.currentTime = Math.max(0, seconds);
    }
  }

  public setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(value, 1));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.015);
    }
    if (this.primaryAudio) {
      this.primaryAudio.volume = clamped;
    }
  }

  public getCurrentTime(): number {
    return this.primaryAudio ? this.primaryAudio.currentTime || 0 : 0;
  }

  public getDuration(): number {
    if (!this.primaryAudio) return 0;
    const d = this.primaryAudio.duration;
    return Number.isFinite(d) && d > 0 ? d : 0;
  }

  public getFrequencySnapshot(): Uint8Array {
    if (!this.analyserNode) return this.frequencyData;
    this.analyserNode.getByteFrequencyData(this.frequencyData as any);
    return this.frequencyData;
  }

  public onEnded(callback: () => void): () => void {
    if (!this.primaryAudio) return () => {};
    this.primaryAudio.addEventListener('ended', callback);
    return () => {
      this.primaryAudio?.removeEventListener('ended', callback);
    };
  }

  public onMetadataLoaded(callback: (duration: number) => void): () => void {
    if (!this.primaryAudio) return () => {};
    const handler = () => {
      const d = this.getDuration();
      if (d > 0) callback(d);
    };
    this.primaryAudio.addEventListener('loadedmetadata', handler);
    this.primaryAudio.addEventListener('durationchange', handler);
    return () => {
      this.primaryAudio?.removeEventListener('loadedmetadata', handler);
      this.primaryAudio?.removeEventListener('durationchange', handler);
    };
  }
}
