/**
 * Mechanical Tactile SFX Engine (SoundEffects.ts)
 * 
 * Tuyệt đối tuân thủ Audio Pure Path:
 * - Module này sở hữu AudioContext phụ trợ độc lập hoàn toàn với AudioEngine chính.
 * - Âm lượng mặc định nhỏ (-18 dB), thời gian phát cực ngắn (15ms - 35ms).
 * - Tổng hợp trực tiếp qua Web Audio Oscillator/Noise, không cần nạp tệp MP3 ngoài.
 */

import { usePlayerStore } from '@/store/usePlayerStore';

export type MechanicalSfxType = 'switch' | 'toggle' | 'tape' | 'beep';

let sfxAudioContext: AudioContext | null = null;

function getSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sfxAudioContext) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      sfxAudioContext = new AudioCtx();
    }
  }
  if (sfxAudioContext && sfxAudioContext.state === 'suspended') {
    void sfxAudioContext.resume();
  }
  return sfxAudioContext;
}

export function playMechanicalSound(type: MechanicalSfxType = 'switch') {
  if (typeof window === 'undefined') return;
  // Không kích hoạt SFX khi ở chế độ chạy ngầm để tránh đánh thức hoặc gây nghẽn AudioContext
  if (typeof document !== 'undefined' && document.hidden) return;

  const isEnabled = usePlayerStore.getState().isSfxEnabled;
  if (!isEnabled) return;

  try {
    const ctx = getSfxContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.06, now); // ~ -18 dB
    masterGain.connect(ctx.destination);

    if (type === 'switch') {
      // 1. Phím cơ relay tiếp điểm bạc: Click tần số 1.8kHz -> 450Hz trong 18ms
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1850, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.018);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.02);
    } else if (type === 'toggle') {
      // 2. Gạt công tắc kim loại cơ học (Heavy Toggle Lever)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.028);

      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.03);
    } else if (type === 'tape') {
      // 3. Tiếng solenoid đóng cơ học của đầu băng cối (Tape Transport Solenoid)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.035);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.038);
    } else if (type === 'beep') {
      // 4. Tiếng beep huỳnh quang retro của màn hình VFD (880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {}
}
