// src/core/audio/AudioEngine.ts
export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private audioCtx: AudioContext | null = null;
  private primaryAudio: HTMLAudioElement;
  private preloadAudio: HTMLAudioElement;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> = new Uint8Array(64);

  private constructor() {
    this.primaryAudio = new Audio();
    this.primaryAudio.crossOrigin = "anonymous"; // Báº¯t buá»™c Ä‘á»ƒ Web Audio API Ä‘á»c stream tá»« Cloudflare R2
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

  // Khá»Ÿi táº¡o Audio Graph sau tÆ°Æ¡ng tÃ¡c Ä‘áº§u tiÃªn cá»§a ngÆ°á»i dÃ¹ng (User Gesture Policy)
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

      // Káº¿t ná»‘i Ä‘á»“ thá»‹ Ã¢m thanh: Source -> Gain -> Analyser -> Loa (Destination)
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

  // Náº¡p trÆ°á»›c header & chunk Ä‘áº§u cá»§a bÃ i káº¿ tiáº¿p (O(1) tá»« peekNext cá»§a DoublyLinkedQueue)
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
      this.analyserNode.getByteFrequencyData(this.frequencyData as any);
    }
    return this.frequencyData;
  }

  public onEnded(callback: () => void): () => void {
    this.primaryAudio.addEventListener("ended", callback);
    return () => this.primaryAudio.removeEventListener("ended", callback);
  }
}

