// src/core/audio/AudioEngine.ts
export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private audioCtx: AudioContext | null = null;
  private primaryAudio: HTMLAudioElement;
  private preloadAudio: HTMLAudioElement;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(64);

  private constructor() {
    this.primaryAudio = new Audio();
    this.primaryAudio.crossOrigin = "anonymous"; // Bắt buộc để Web Audio API đọc stream từ Cloudflare R2
    this.primaryAudio.preload = "auto";

    this.preloadAudio = new Audio();
    this.preloadAudio.crossOrigin = "anonymous";
    this.preloadAudio.preload = "auto";
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  // Khởi tạo Audio Graph sau tương tác đầu tiên của người dùng (User Gesture Policy)
  private ensureAudioContext(): void {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.sourceNode = this.audioCtx.createMediaElementSource(
        this.primaryAudio
      );
      this.gainNode = this.audioCtx.createGain();
      this.analyserNode = this.audioCtx.createAnalyser();

      this.analyserNode.fftSize = 128;
      this.analyserNode.smoothingTimeConstant = 0.82;
      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);

      // Kết nối đồ thị âm thanh: Source -> Gain -> Analyser -> Loa (Destination)
      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  public async loadAndPlay(url: string, startOffsetSeconds = 0): Promise<void> {
    this.ensureAudioContext();
    if (this.primaryAudio.src !== url) {
      this.primaryAudio.src = url;
    }
    this.primaryAudio.currentTime = startOffsetSeconds;
    await this.primaryAudio.play();
  }

  // Nạp trước header & chunk đầu của bài kế tiếp (O(1) từ peekNext của DoublyLinkedQueue)
  public preloadNextTrack(nextUrl: string | null): void {
    if (!nextUrl || this.preloadAudio.src === nextUrl) return;
    this.preloadAudio.src = nextUrl;
    this.preloadAudio.load();
  }

  public play(): Promise<void> {
    this.ensureAudioContext();
    return this.primaryAudio.play();
  }

  public pause(): void {
    this.primaryAudio.pause();
  }

  public seek(seconds: number): void {
    this.primaryAudio.currentTime = Math.max(
      0,
      Math.min(seconds, this.primaryAudio.duration || 0)
    );
  }

  public setVolume(value: number): void {
    const clamped = Math.max(0, Math.min(value, 1));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(
        clamped,
        this.audioCtx.currentTime,
        0.015
      );
    } else {
      this.primaryAudio.volume = clamped;
    }
  }

  public getCurrentTime(): number {
    return this.primaryAudio.currentTime;
  }

  public getDuration(): number {
    return this.primaryAudio.duration || 0;
  }

  public getFrequencySnapshot(): Uint8Array {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(this.frequencyData);
    }
    return this.frequencyData;
  }

  public onEnded(callback: () => void): () => void {
    this.primaryAudio.addEventListener("ended", callback);
    return () => this.primaryAudio.removeEventListener("ended", callback);
  }
}