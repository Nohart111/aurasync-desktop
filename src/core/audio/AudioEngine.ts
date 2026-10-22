/**
 * Singleton Web Audio & HTML5 Audio Engine
 * - Guarantees a single active ended/timeupdate listener even when multiple components call useAudioPlayer()
 * - Prevents duplicate loadAndPlay restarts when multiple hook instances run in the same render pass
 * - Mutual Exclusion: automatically stops YouTubePreviewBridge when playing a Vault CDN track
 * - Avoids routing <audio> through createMediaElementSource on mobileOS (iOS/iPadOS/Android) so Lock Screen
 *   background playback never gets muted when the OS suspends AudioContext in deep sleep
 * - Preloads next track at 70% progress so track transitions while screen is locked happen in 0ms
 */
export interface EqBandConfig {
  freq: number;
  label: string;
  type: BiquadFilterType;
}

export const EQ_BANDS: EqBandConfig[] = [
  { freq: 32, label: '32Hz', type: 'lowshelf' },
  { freq: 64, label: '64Hz', type: 'peaking' },
  { freq: 125, label: '125Hz', type: 'peaking' },
  { freq: 250, label: '250Hz', type: 'peaking' },
  { freq: 500, label: '500Hz', type: 'peaking' },
  { freq: 1000, label: '1kHz', type: 'peaking' },
  { freq: 2000, label: '2kHz', type: 'peaking' },
  { freq: 4000, label: '4kHz', type: 'peaking' },
  { freq: 8000, label: '8kHz', type: 'peaking' },
  { freq: 16000, label: '16kHz', type: 'highshelf' },
];

export const EQ_PRESETS: Record<string, number[]> = {
  'Flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [7, 6, 4, 1, 0, 0, 0, 1, 2, 3],
  'Vocal': [-2, -1, 0, 1, 3, 4, 3, 1, 0, -1],
  'Acoustic': [3, 2, 1, 0, 1, 2, 3, 4, 4, 3],
  'Club / EDM': [6, 5, 3, 0, -1, 1, 2, 4, 5, 6],
  'Warm Tape': [3, 2, 2, 1, 0, -1, -1, -2, -3, -4],
};

export class AudioEngine {
  private static instance: AudioEngine;
  private primaryAudio: HTMLAudioElement | null = null;
  private preloadAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private compressorNode: DynamicsCompressorNode | null = null;
  private currentEqGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private isEqBypassed: boolean = false;
  private frequencyData: Uint8Array = new Uint8Array(64);

  private currentUrl: string = '';
  private currentNonce: number = -1;
  private isLoading: boolean = false;
  private activeLoadId: number = 0;
  private endedFiredForLoad: boolean = false;

  private nextPreloadUrl: string = '';
  private hasTriggered70PercentPreload: boolean = false;

  private timeUpdateCallback: ((time: number) => void) | null = null;
  private durationChangeCallback: ((duration: number) => void) | null = null;
  private endedCallback: (() => void) | null = null;
  private errorCallback: ((err: string) => void) | null = null;
  private playStateCallback: ((isPlaying: boolean) => void) | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.primaryAudio = new Audio();
      if (!this.isMobileDevice()) {
        this.primaryAudio.crossOrigin = 'anonymous';
      }
      this.primaryAudio.preload = 'auto';
      (this.primaryAudio as any).playsInline = true;
      this.primaryAudio.setAttribute('playsinline', '');
      this.primaryAudio.setAttribute('webkit-playsinline', '');

      // Gắn Audio element vào DOM để tránh bị iOS Safari / Android thu hồi tiến trình (garbage collect) khi phát trong nền
      const attachAudio = () => {
        if (typeof document !== 'undefined' && document.body && this.primaryAudio && !this.primaryAudio.parentElement) {
          this.primaryAudio.id = 'aurasound-primary-audio';
          this.primaryAudio.style.position = 'fixed';
          this.primaryAudio.style.width = '1px';
          this.primaryAudio.style.height = '1px';
          this.primaryAudio.style.opacity = '0.001';
          this.primaryAudio.style.pointerEvents = 'none';
          this.primaryAudio.style.zIndex = '-100';
          document.body.appendChild(this.primaryAudio);
        }
      };
      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', attachAudio, { once: true });
      } else {
        attachAudio();
      }

      this.preloadAudio = new Audio();
      if (!this.isMobileDevice()) {
        this.preloadAudio.crossOrigin = 'anonymous';
      }
      this.preloadAudio.preload = 'auto';
      (this.preloadAudio as any).playsInline = true;
      this.preloadAudio.setAttribute('playsinline', '');
      this.preloadAudio.setAttribute('webkit-playsinline', '');

      this.bindNativeEvents();

      const unlock = () => {
        if (typeof document !== 'undefined' && !document.hidden) {
          this.resumeContext();
        }
      };
      window.addEventListener('click', unlock, { capture: true, passive: true });
      window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
      window.addEventListener('touchstart', unlock, { capture: true, passive: true });
      window.addEventListener('keydown', unlock, { capture: true, passive: true });
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  private stopPreviewBridgeIfActive(): void {
    if (typeof window !== 'undefined' && typeof (window as any).__AURASOUND_STOP_YT_PREVIEW__ === 'function') {
      try {
        (window as any).__AURASOUND_STOP_YT_PREVIEW__();
      } catch {}
    }
  }

  public resumeContext(): void {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  private bindNativeEvents(): void {
    if (!this.primaryAudio) return;

    this.primaryAudio.addEventListener('timeupdate', () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        this.resumeContext();
      }
      if (!this.primaryAudio) return;

      const curr = this.primaryAudio.currentTime || 0;
      const dur = this.primaryAudio.duration || 0;

      if (
        !this.hasTriggered70PercentPreload &&
        this.nextPreloadUrl &&
        dur > 0 &&
        isFinite(dur) &&
        curr / dur >= 0.7
      ) {
        this.hasTriggered70PercentPreload = true;
        this.triggerPreloadFetch(this.nextPreloadUrl);
      }

      if (this.timeUpdateCallback) {
        this.timeUpdateCallback(curr);
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

    this.primaryAudio.addEventListener('play', () => {
      this.stopPreviewBridgeIfActive();
      if (this.playStateCallback) {
        this.playStateCallback(true);
      }
    });

    this.primaryAudio.addEventListener('pause', () => {
      if (!this.primaryAudio || this.primaryAudio.ended || this.isLoading) return;
      if (this.playStateCallback) {
        this.playStateCallback(false);
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
    // BẤT BIẾN QUAN TRỌNG CHO MOBILE:
    // Tuyệt đối KHÔNG gắn createMediaElementSource() trên iOS Safari / Android Chrome!
    // Hệ điều hành di động sẽ đình chỉ (suspend) AudioContext khi tắt màn hình hoặc ẩn tab,
    // khiến toàn bộ âm thanh ngầm bị ngắt tiếng.
    // Giữ nguyên AudioElement thuần giúp tận dụng 100% pipeline âm thanh ngầm tự nhiên của OS.
    if (this.isMobileDevice()) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    try {
      if (!this.audioCtx) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;

        this.audioCtx = new AudioContextClass();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.35;
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = Math.max(0, Math.min(1, this.primaryAudio.volume || 0.8));

        this.sourceNode = this.audioCtx.createMediaElementSource(this.primaryAudio);

        // 1. DÀN 10-BAND GRAPHIC EQUALIZER CHUẨN STUDIO MASTERING
        this.eqFilters = EQ_BANDS.map((band, idx) => {
          const filter = this.audioCtx!.createBiquadFilter();
          filter.type = band.type;
          filter.frequency.value = band.freq;
          filter.Q.value = 1.4;
          filter.gain.value = this.isEqBypassed ? 0 : (this.currentEqGains[idx] || 0);
          return filter;
        });

        // 2. DYNAMICS COMPRESSOR / PEAK LIMITER:
        // Chống 100% hiện tượng vỡ tiếng (clipping/distortion) khi người dùng boost bass mạnh hoặc nghe volume lớn
        this.compressorNode = this.audioCtx.createDynamicsCompressor();
        this.compressorNode.threshold.value = -1.0;
        this.compressorNode.knee.value = 6;
        this.compressorNode.ratio.value = 16;
        this.compressorNode.attack.value = 0.003;
        this.compressorNode.release.value = 0.15;

        // Chuỗi phát âm thanh chuẩn phòng thu:
        // Source -> Filter[0] -> Filter[1] -> ... -> Filter[9] -> Limiter Compressor -> GainNode -> Speakers
        let prevNode: AudioNode = this.sourceNode;
        for (const filter of this.eqFilters) {
          prevNode.connect(filter);
          prevNode = filter;
        }
        prevNode.connect(this.compressorNode);
        this.compressorNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);

        // Nhánh cảm biến Analyser song song: lấy tín hiệu sau compressor
        // để dàn đèn VU Meter và Spectrum phản ánh chuẩn xác chất âm sau khi qua EQ
        this.compressorNode.connect(this.analyser);

        (window as any).__AURASOUND_ANALYSER__ = this.analyser;
      }

      this.resumeContext();
    } catch {}
  }

  public setEqGain(bandIdx: number, gainDb: number): void {
    if (bandIdx < 0 || bandIdx >= 10) return;
    const safeGain = Math.max(-12, Math.min(12, gainDb));
    this.currentEqGains[bandIdx] = safeGain;
    if (this.eqFilters[bandIdx] && !this.isEqBypassed) {
      if (this.audioCtx && this.audioCtx.state === 'running') {
        this.eqFilters[bandIdx].gain.setTargetAtTime(safeGain, this.audioCtx.currentTime, 0.02);
      } else {
        this.eqFilters[bandIdx].gain.value = safeGain;
      }
    }
  }

  public setAllEqGains(gains: number[]): void {
    if (!Array.isArray(gains)) return;
    this.currentEqGains = gains.slice(0, 10).map((g) => Math.max(-12, Math.min(12, g)));
    this.eqFilters.forEach((filter, idx) => {
      const targetGain = this.isEqBypassed ? 0 : (this.currentEqGains[idx] || 0);
      if (this.audioCtx && this.audioCtx.state === 'running') {
        filter.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.02);
      } else {
        filter.gain.value = targetGain;
      }
    });
  }

  public setEqBypassed(bypassed: boolean): void {
    this.isEqBypassed = Boolean(bypassed);
    this.eqFilters.forEach((filter, idx) => {
      const targetGain = this.isEqBypassed ? 0 : (this.currentEqGains[idx] || 0);
      if (this.audioCtx && this.audioCtx.state === 'running') {
        filter.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.02);
      } else {
        filter.gain.value = targetGain;
      }
    });
  }

  public getEqGains(): number[] {
    return [...this.currentEqGains];
  }

  public async loadAndPlay(url: string, nonce?: number): Promise<void> {
    if (!this.primaryAudio || !url || url.startsWith('yt-preview:')) return;

    // Ngắt ngay trình nghe thử YouTube trước khi phát nhạc từ kho CDN
    this.stopPreviewBridgeIfActive();

    const isSameUrl = this.currentUrl === url && Boolean(this.primaryAudio.src);
    const isNewNonce = typeof nonce === 'number' && nonce !== this.currentNonce;

    if (isSameUrl && !isNewNonce) {
      if (this.isLoading || (!this.primaryAudio.paused && !this.primaryAudio.ended)) {
        return;
      }
      this.endedFiredForLoad = false;
      this.resumeContext();
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
    this.hasTriggered70PercentPreload = false;
    this.isLoading = true;

    try {
      if (!this.isMobileDevice()) {
        if (this.primaryAudio.crossOrigin !== 'anonymous') {
          this.primaryAudio.crossOrigin = 'anonymous';
        }
      } else {
        this.primaryAudio.removeAttribute('crossorigin');
      }

      if (!isSameUrl) {
        if (!this.isMobileDevice()) {
          this.primaryAudio.pause();
          this.primaryAudio.src = url;
          this.currentUrl = url;
          this.primaryAudio.load();
        } else {
          // Trên mobile: gán trực tiếp src mà không gọi pause() hay load()
          // để duy trì quyền ưu tiên phát âm thanh ngầm liên tục của OS khi chuyển bài
          this.primaryAudio.src = url;
          this.currentUrl = url;
        }
      } else {
        this.primaryAudio.currentTime = 0;
      }

      if (typeof nonce === 'number') {
        this.currentNonce = nonce;
      }

      this.ensureAudioContext();
      this.resumeContext();

      if (loadId !== this.activeLoadId) return;

      await this.primaryAudio.play();
    } catch (err: any) {
      if (loadId !== this.activeLoadId) return;
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

  private triggerPreloadFetch(nextUrl: string): void {
    if (!this.preloadAudio || !nextUrl || nextUrl.startsWith('yt-preview:')) return;
    try {
      if (this.preloadAudio.src !== nextUrl) {
        this.preloadAudio.src = nextUrl;
        this.preloadAudio.load();
      }
    } catch {}
  }

  public preloadNextTrack(nextUrl: string | null): void {
    if (!nextUrl || nextUrl.startsWith('yt-preview:')) {
      this.nextPreloadUrl = '';
      return;
    }
    this.nextPreloadUrl = nextUrl;
    const dur = this.getDuration();
    const curr = this.getCurrentTime();
    if (dur > 0 && curr / dur >= 0.7) {
      this.hasTriggered70PercentPreload = true;
      this.triggerPreloadFetch(nextUrl);
    }
  }

  public async play(fallbackUrl?: string, nonce?: number): Promise<void> {
    if (!this.primaryAudio) return;
    const targetUrl = this.currentUrl || fallbackUrl || '';
    if (!targetUrl || targetUrl.startsWith('yt-preview:')) return;

    this.stopPreviewBridgeIfActive();

    if (!this.primaryAudio.src || this.currentUrl !== targetUrl) {
      return this.loadAndPlay(targetUrl, nonce);
    }

    try {
      this.endedFiredForLoad = false;
      this.resumeContext();
      if (this.primaryAudio.ended) {
        this.primaryAudio.currentTime = 0;
      }
      if (this.gainNode && this.audioCtx && this.audioCtx.state === 'running') {
        const targetVol = Math.max(0.001, Math.min(1, this.primaryAudio.volume || 0.8));
        try {
          this.gainNode.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
          this.gainNode.gain.exponentialRampToValueAtTime(targetVol, this.audioCtx.currentTime + 0.035);
        } catch {}
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
    if (this.gainNode && this.audioCtx && this.audioCtx.state === 'running' && !this.primaryAudio.paused) {
      const currentVol = Math.max(0.001, this.primaryAudio.volume || 0.8);
      try {
        this.gainNode.gain.setValueAtTime(currentVol, this.audioCtx.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.035);
      } catch {}
      setTimeout(() => {
        this.primaryAudio?.pause();
        if (this.gainNode && this.audioCtx) {
          try {
            this.gainNode.gain.setValueAtTime(currentVol, this.audioCtx.currentTime);
          } catch {}
        }
      }, 40);
    } else {
      this.primaryAudio.pause();
    }
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
    if (typeof document !== 'undefined' && document.hidden) {
      return this.frequencyData;
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyData as any);
    } else if (this.primaryAudio && !this.primaryAudio.paused) {
      // Mô phỏng phổ tần số mượt mà cho mobile khi mở màn hình
      const t = this.primaryAudio.currentTime || 0;
      for (let i = 0; i < this.frequencyData.length; i++) {
        const wave = Math.sin(t * 7.5 + i * 0.45) * 0.5 + 0.5;
        const beat = Math.pow(Math.max(0, Math.sin(t * 3.75)), 2.5);
        this.frequencyData[i] = Math.floor((wave * 0.6 + beat * 0.4) * 190 + 25);
      }
    } else {
      this.frequencyData.fill(0);
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

  public onPlayStateChange(cb: (isPlaying: boolean) => void): () => void {
    this.playStateCallback = cb;
    return () => {
      if (this.playStateCallback === cb) this.playStateCallback = null;
    };
  }
}

export const audioEngine = AudioEngine.getInstance();
export default AudioEngine;
