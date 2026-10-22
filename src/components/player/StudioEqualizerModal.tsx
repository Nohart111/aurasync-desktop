'use client';

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Sliders,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Check,
  Power,
  Activity,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { AudioEngine, EQ_BANDS, EQ_PRESETS } from '@/core/audio/AudioEngine';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

export function StudioEqualizerModal() {
  const {
    isEqOpen,
    toggleEq,
    eqGains,
    eqPreset,
    isEqBypassed,
    setEqGain,
    setEqPreset,
    toggleEqBypass,
    resetEq,
  } = usePlayerStore();

  const audioEngine = AudioEngine.getInstance();

  // Đồng bộ thiết lập EQ từ Zustand sang AudioEngine
  useEffect(() => {
    audioEngine.setAllEqGains(eqGains);
    audioEngine.setEqBypassed(isEqBypassed);
  }, [eqGains, isEqBypassed, audioEngine]);

  // Phím tắt ESC để đóng modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEqOpen) {
        e.preventDefault();
        playMechanicalSound('toggle');
        toggleEq(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEqOpen, toggleEq]);

  const handleSliderChange = (idx: number, val: number) => {
    setEqGain(idx, val);
    audioEngine.setEqGain(idx, val);
  };

  const handleSelectPreset = (presetName: string) => {
    const presetValues = EQ_PRESETS[presetName];
    if (presetValues) {
      playMechanicalSound('switch');
      setEqPreset(presetName, presetValues);
      audioEngine.setAllEqGains(presetValues);
      audioEngine.setEqBypassed(false);
    }
  };

  const handleReset = () => {
    playMechanicalSound('toggle');
    resetEq();
    audioEngine.setAllEqGains([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    audioEngine.setEqBypassed(false);
  };

  const handleToggleBypass = () => {
    playMechanicalSound('switch');
    toggleEqBypass();
    audioEngine.setEqBypassed(!isEqBypassed);
  };

  return (
    <AnimatePresence>
      {isEqOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="relative flex w-full max-w-4xl flex-col rounded-3xl border border-white/15 bg-[#090914]/98 p-5 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl select-none"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-mono text-sm sm:text-base font-bold text-white tracking-wider">
                      STUDIO_DSP // 10-BAND GRAPHIC EQUALIZER
                    </h2>
                    <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                      32-BIT PURE PATH
                    </span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400 mt-0.5">
                    Bộ cân bằng tần số phần cứng + Dynamics Peak Limiter chống vỡ tiếng
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Công tắc Bypass */}
                <button
                  onClick={handleToggleBypass}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-xs font-bold border transition cursor-pointer active:scale-95 ${
                    isEqBypassed
                      ? 'border-zinc-700 bg-zinc-800/60 text-zinc-400'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  }`}
                  title="Ngắt hoặc kích hoạt hiệu ứng EQ"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>{isEqBypassed ? 'BYPASS (OFF)' : 'DSP: ACTIVE'}</span>
                </button>

                {/* Nút Đóng */}
                <button
                  onClick={() => {
                    playMechanicalSound('toggle');
                    toggleEq(false);
                  }}
                  className="rounded-xl border border-transparent p-2 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                  title="Đóng [ESC]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Presets Bar */}
            <div className="my-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-2.5 sm:p-3">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-mono text-[11px] text-zinc-400 uppercase tracking-wider mr-1">
                  PRESETS:
                </span>
                {Object.keys(EQ_PRESETS).map((pName) => {
                  const isSelected = eqPreset === pName && !isEqBypassed;
                  return (
                    <button
                      key={pName}
                      onClick={() => handleSelectPreset(pName)}
                      className={`rounded-xl px-3 py-1 font-mono text-xs font-semibold transition active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400 text-black font-bold shadow-[0_0_14px_rgba(251,191,36,0.4)]'
                          : 'border border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {pName}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleReset}
                className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-xs text-zinc-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer active:scale-95"
                title="Đặt lại tất cả dải tần về 0 dB"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset 0dB</span>
              </button>
            </div>

            {/* 10-Band Vertical Faders Display */}
            <div
              className={`relative flex items-center justify-between gap-1 sm:gap-3 rounded-2xl bg-black/40 border border-white/[0.06] p-4 sm:p-6 transition-opacity duration-200 ${
                isEqBypassed ? 'opacity-40 pointer-events-none' : 'opacity-100'
              }`}
            >
              {/* Vạch chia độ dB nền (0 dB Grid Line) */}
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 border-b border-dashed border-white/15 pointer-events-none z-0">
                <span className="absolute right-0 -top-2.5 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                  0 dB (FLAT)
                </span>
              </div>

              {EQ_BANDS.map((band, idx) => {
                const gain = eqGains[idx] || 0;
                const isPositive = gain > 0;
                const isNegative = gain < 0;

                return (
                  <div
                    key={band.freq}
                    className="relative z-10 flex flex-1 flex-col items-center gap-3"
                  >
                    {/* Chỉ số dB */}
                    <div
                      className={`font-mono text-[10px] sm:text-xs font-bold tabular-nums transition-colors ${
                        isPositive
                          ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                          : isNegative
                          ? 'text-cyan-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {gain > 0 ? `+${gain}` : gain}
                    </div>

                    {/* Fader Track */}
                    <div className="relative flex h-44 sm:h-52 w-8 sm:w-10 items-center justify-center">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        onChange={(e) => handleSliderChange(idx, parseFloat(e.target.value))}
                        className="eq-fader-vertical h-full w-2 cursor-pointer appearance-none bg-zinc-800 rounded-full focus:outline-none"
                        style={{
                          writingMode: 'vertical-lr',
                          direction: 'rtl',
                        }}
                      />
                    </div>

                    {/* Nhãn tần số */}
                    <div className="text-center font-mono">
                      <span className="block text-[11px] sm:text-xs font-bold text-zinc-200">
                        {band.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Telemetry */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-zinc-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span>PEAK_LIMITER: ACTIVE (-1.0 dBFS)</span>
                </span>
                <span className="hidden sm:inline text-zinc-600">|</span>
                <span className="hidden sm:flex items-center gap-1 text-zinc-400">
                  <Activity className="h-3.5 w-3.5 text-amber-400" />
                  <span>Q FACTOR: 1.4 OCTAVE</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-zinc-400">
                <span>Phím tắt: <kbd className="rounded border border-white/15 bg-white/[0.08] px-1.5 py-0.5 text-white">E</kbd></span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
