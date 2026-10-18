export class AudioEngine {
  private static instance: AudioEngine | null = null;
  private primaryAudio: HTMLAudioElement;

  private constructor() {
    this.primaryAudio = new Audio();
    this.primaryAudio.preload = "auto";
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public async loadAndPlay(url: string, startOffsetSeconds = 0): Promise<void> {
    if (this.primaryAudio.src !== url) {
      this.primaryAudio.src = url;
    }
    if (startOffsetSeconds > 0) {
      try {
        this.primaryAudio.currentTime = startOffsetSeconds;
      } catch (e) {
        // Bỏ qua nếu metadata chưa tải xong
      }
    }
    return this.primaryAudio.play();
  }

  public async play(): Promise<void> {
    if (!this.primaryAudio.src) return;
    return this.primaryAudio.play();
  }

  public pause(): void {
    this.primaryAudio.pause();
  }

  public seek(seconds: number): void {
    if (this.primaryAudio.duration) {
      this.primaryAudio.currentTime = Math.max(
        0,
        Math.min(seconds, this.primaryAudio.duration)
      );
    }
  }

  public setVolume(value: number): void {
    this.primaryAudio.volume = Math.max(0, Math.min(value, 1));
  }

  public getCurrentTime(): number {
    return this.primaryAudio.currentTime || 0;
  }

  public getDuration(): number {
    return this.primaryAudio.duration || 0;
  }

  public onEnded(callback: () => void): () => void {
    this.primaryAudio.addEventListener("ended", callback);
    return () => this.primaryAudio.removeEventListener("ended", callback);
  }
}
