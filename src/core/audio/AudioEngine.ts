// src/core/audio/AudioEngine.ts
export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private audioCtx: AudioContext | null = null;
  private primaryAudio: HTMLAudioElement | null = null;
  private preloadAudio: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(64);

  private constructor() {
    if (typeof window !== "undefined") {
      this.primaryAudio = new Audio();
      this.primaryAudio.crossOrigin = "anonymous";
      this.primaryAudio.preload = "auto";

      this.preloadAudio = new Audio();
      this.preloadAudio.crossOrigin = "anonymous";
      this.preloadAudio.preload = "auto";
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private ensureAudioContext(): void {
    if (typeof window === "undefined" || !this.primaryAudio) return;

    if (!this.audioCtx) {
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
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  public async loadAndPlay(url: string, startOffsetSeconds = 0): Promise<void> {
    if (!this.primaryAudio) return;
    this.ensureAudioContext();

    // Tự động bọc qua proxy cùng tên miền nếu là link GitHub để không bao giờ bị lỗi CORS
    const safeUrl = url.startsWith("https://github.com/")
      ? `/api/tracks/stream?url=${encodeURIComponent(url)}`
      : url;

    if (this.primaryAudio.src !== window.location.origin + safeUrl && this.primaryAudio.src !== safeUrl) {
      this.primaryAudio.src = safeUrl;
    }
    this.primaryAudio.currentTime = startOffsetSeconds;
    await this.primaryAudio.play();
  }

  public preloadNextTrack(nextUrl: string | null): void {
    if (!this.preloadAudio || !nextUrl) return;
    const safeUrl = nextUrl.startsWith("https://github.com/")
      ? `/api/tracks/stream?url=${encodeURIComponent(nextUrl)}`
      : nextUrl;
    if (this.preloadAudio.src === safeUrl) return;
    this.preloadAudio.src = safeUrl;
    this.preloadAudio.load();
  }

  public async play(): Promise<void> {
    if (!this.primaryAudio) return;
    this.ensureAudioContext();
    await this.primaryAudio.play();
  }

  public pause(): void {
    this.primaryAudio?.pause();
  }

  public seek(seconds: number): void {
    if (!this.primaryAudio) return;
    const maxDur = this.primaryAudio.duration || 0;
    if (maxDur > 0 && Number.isFinite(maxDur)) {
      this.primaryAudio.currentTime = Math.max(0, Math.min(seconds, maxDur));
    }
  }

  public setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(value, 1));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(clamped, this.audioCtx.currentTime, 0.015);
    } else if (this.primaryAudio) {
      this.primaryAudio.volume = clamped;
    }
  }

  public getCurrentTime(): number {
    return this.primaryAudio?.currentTime || 0;
  }

  public getDuration(): number {
    const dur = this.primaryAudio?.duration || 0;
    return Number.isFinite(dur) ? dur : 0;
  }

  public getFrequencySnapshot(): Uint8Array {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(this.frequencyData as Uint8Array<ArrayBuffer>);
    }
    return this.frequencyData;
  }

  public onEnded(callback: () => void): () => void {
    if (!this.primaryAudio) return () => {};
    this.primaryAudio.addEventListener("ended", callback);
    return () => this.primaryAudio?.removeEventListener("ended", callback);
  }
}