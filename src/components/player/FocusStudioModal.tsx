'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Disc3,
  Clock,
  Radio,
  Minimize2,
  Volume2,
  VolumeX,
  Sparkles,
  Heart,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { AudioEngine } from '@/core/audio/AudioEngine';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

export function FocusStudioModal() {
  const [mounted, setMounted] = useState(false);
  const {
    currentTrack,
    isPlaying,
    volume,
    likedTrackIds,
    isFocusMode,
    setPlaying,
    setVolume,
    advanceNext,
    advancePrev,
    toggleLikeTrack,
    toggleFocusMode,
  } = usePlayerStore();

  const { currentTime, actualDuration } = useAudioPlayer();

  const containerRef = useRef<HTMLDivElement>(null);
  const dbTextRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef<number>(0);
  const avgBassRef = useRef<number>(30);
  const avgMelodyRef = useRef<number>(35);
  const peakEnergyRef = useRef<number>(125);
  const freqDataRef = useRef<Uint8Array>(new Uint8Array(64));

  useEffect(() => {
    setMounted(true);
  }, []);

  // Studio VU meter loop for Focus Mode
  useEffect(() => {
    if (!isFocusMode) return;
    let phase = 0;

    const updateMeter = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        rafRef.current = null;
        return;
      }

      phase += 0.04;
      let hasRealAudio = false;
      let instantEnergy = 0;

      if (isPlaying) {
        let analyserNode: any = null;
        if (typeof window !== 'undefined') {
          analyserNode = (window as any).__AURASOUND_ANALYSER__;
        }

        if (analyserNode) {
          try {
            analyserNode.getByteFrequencyData(freqDataRef.current);
            const data = freqDataRef.current;

            let bassSum = 0;
            for (let i = 0; i <= 2; i++) bassSum += data[i] || 0;
            const bass = bassSum / 3;

            let melodySum = 0;
            for (let i = 3; i <= 12; i++) melodySum += data[i] || 0;
            const melody = melodySum / 10;

            let trebleSum = 0;
            for (let i = 13; i <= 24; i++) trebleSum += data[i] || 0;
            const treble = trebleSum / 12;

            if (bass > 2.5 || melody > 2.5 || treble > 2.5) {
              hasRealAudio = true;
              avgBassRef.current = avgBassRef.current * 0.95 + bass * 0.05;
              avgMelodyRef.current = avgMelodyRef.current * 0.94 + melody * 0.06;

              const bassPunch = Math.max(0, bass - avgBassRef.current);
              const melodySwell = Math.max(0, melody - avgMelodyRef.current * 0.9);

              instantEnergy =
                melody * 0.4 +
                bass * 0.38 +
                treble * 0.14 +
                (bassPunch * 0.38 + melodySwell * 0.24);
            }
          } catch {}
        }

        if (!hasRealAudio) {
          try {
            const engine = AudioEngine.getInstance();
            const snap = engine.getFrequencySnapshot();
            if (snap && snap.length > 0) {
              let bassSum = 0;
              for (let i = 0; i <= 2; i++) bassSum += snap[i] || 0;
              const bass = bassSum / 3;

              let melodySum = 0;
              for (let i = 3; i <= 12; i++) melodySum += snap[i] || 0;
              const melody = melodySum / 10;

              let trebleSum = 0;
              for (let i = 13; i <= 24; i++) trebleSum += snap[i] || 0;
              const treble = trebleSum / 12;

              if (bass > 2.5 || melody > 2.5 || treble > 2.5) {
                hasRealAudio = true;
                avgBassRef.current = avgBassRef.current * 0.95 + bass * 0.05;
                avgMelodyRef.current = avgMelodyRef.current * 0.94 + melody * 0.06;

                const bassPunch = Math.max(0, bass - avgBassRef.current);
                const melodySwell = Math.max(0, melody - avgMelodyRef.current * 0.9);

                instantEnergy =
                  melody * 0.4 +
                  bass * 0.38 +
                  treble * 0.14 +
                  (bassPunch * 0.38 + melodySwell * 0.24);
              }
            }
          } catch {}
        }
      }

      let targetLeds = 0;

      if (isPlaying) {
        if (hasRealAudio) {
          if (instantEnergy > peakEnergyRef.current) {
            peakEnergyRef.current = peakEnergyRef.current * 0.7 + instantEnergy * 0.3;
          } else {
            peakEnergyRef.current = Math.max(125, peakEnergyRef.current * 0.998);
          }

          const effective = Math.max(0, instantEnergy - 8);
          const dynamicRange = Math.max(110, peakEnergyRef.current - 8);
          const norm = Math.min(1.0, effective / dynamicRange);
          targetLeds = Math.min(21.5, Math.pow(norm, 1.52) * 23.0);
        } else {
          const store = usePlayerStore.getState();
          const trackTime =
            typeof store.progress === "number" && store.progress > 0
              ? store.progress
              : phase * 0.45;

          const bpm = 124;
          const beatSec = 60 / bpm;
          const beatPhase = (trackTime / beatSec) * Math.PI * 2;

          const kickPulse = Math.pow(Math.max(0, Math.sin(beatPhase)), 3.5);
          const snarePulse = Math.pow(Math.max(0, Math.sin(beatPhase + Math.PI)), 2.8);
          const melodyWave =
            Math.sin(trackTime * 1.7) * 0.35 + Math.sin(trackTime * 0.65) * 0.25 + 0.5;
          const hihatTick = Math.pow(Math.max(0, Math.sin(beatPhase * 2)), 4.0) * 0.2;

          const grooveIntensity =
            melodyWave * 0.32 + kickPulse * 0.42 + snarePulse * 0.2 + hihatTick;
          targetLeds = Math.min(16.5, Math.max(2.0, 2.5 + Math.pow(grooveIntensity, 1.5) * 14.0));
        }
      }

      if (!isPlaying) {
        smoothedLevelRef.current = Math.max(0, smoothedLevelRef.current * 0.85 - 0.25);
      } else if (targetLeds > smoothedLevelRef.current) {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.28;
      } else {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.12;
      }

      const activeCount = isPlaying ? Math.max(1, Math.round(smoothedLevelRef.current)) : 0;

      if (containerRef.current) {
        const leds = containerRef.current.children;
        for (let i = 0; i < 24; i++) {
          const led = leds[i] as HTMLElement;
          if (!led) continue;

          if (i < activeCount && isPlaying) {
            if (i < 12) {
              led.className =
                'flex-1 rounded-sm bg-emerald-400 shadow-[0_0_8px_#10B981] transition-colors duration-100 ease-out';
            } else if (i < 18) {
              led.className =
                'flex-1 rounded-sm bg-amber-400 shadow-[0_0_10px_#F59E0B] transition-colors duration-100 ease-out';
            } else {
              led.className =
                'flex-1 rounded-sm bg-rose-500 shadow-[0_0_12px_#EF4444] transition-colors duration-100 ease-out';
            }
          } else {
            led.className =
              'flex-1 rounded-sm bg-zinc-800/40 transition-colors duration-150 ease-out';
          }
        }
      }

      if (dbTextRef.current) {
        if (!isPlaying || activeCount === 0) {
          dbTextRef.current.innerText = '-∞ dB (STANDBY)';
          dbTextRef.current.className = 'text-zinc-600 font-bold shrink-0';
        } else {
          const dbVal = Math.round((activeCount / 24) * 48 - 42);
          if (activeCount >= 18) {
            dbTextRef.current.innerText = `+${Math.max(1, dbVal)} dB (PEAK)`;
            dbTextRef.current.className = 'text-rose-400 font-bold shrink-0';
          } else if (activeCount >= 12) {
            dbTextRef.current.innerText = `${dbVal >= 0 ? '+' : ''}${dbVal} dB (0 VU)`;
            dbTextRef.current.className = 'text-amber-400 font-bold shrink-0';
          } else {
            dbTextRef.current.innerText = `${dbVal} dB`;
            dbTextRef.current.className = 'text-emerald-400 font-bold shrink-0';
          }
        }
      }

      rafRef.current = requestAnimationFrame(updateMeter);
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(updateMeter);
      }
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isFocusMode, isPlaying]);

  if (!mounted || !isFocusMode) return null;

  const isLiked = currentTrack ? (likedTrackIds || []).includes(currentTrack.id) : false;

  const formatDuration = (seconds?: number) => {
    const s = Math.floor(seconds || 180);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const content = (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#050508] p-4 sm:p-8 select-none font-sans overflow-hidden">
      {/* Dynamic Ambient Background Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.12),transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(0,240,255,0.08),transparent_60%)]" />

      {/* Top Bar: Cyberdeck Title & Exit Button */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/[0.08] pb-3.5 sm:pb-4">
        <div className="flex items-center gap-2.5">
          <Radio className="h-4 w-4 text-neon-cyan animate-pulse" />
          <span className="font-mono text-xs font-bold text-white tracking-widest uppercase">
            STUDIO_FOCUS // IMMERSIVE DECK
          </span>
          <span className="hidden sm:inline-block rounded bg-neon-cyan/15 border border-neon-cyan/30 px-2 py-0.5 text-[10px] font-mono text-neon-cyan font-bold">
            MASTER HI-FI
          </span>
        </div>

        <button
          onClick={() => {
            playMechanicalSound('toggle');
            toggleFocusMode(false);
          }}
          className="btn-cyberdeck flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-mono font-bold text-zinc-200 hover:text-white cursor-pointer"
        >
          <Minimize2 className="h-4 w-4 text-neon-cyan" />
          <span>THOÁT FOCUS [ESC]</span>
        </button>
      </header>

      {/* Centerpiece: Massive Vinyl Record */}
      <main className="relative z-10 flex flex-col items-center justify-center my-auto py-6">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glow Disk Behind Vinyl */}
          <div
            className={`absolute h-72 w-72 sm:h-96 sm:w-96 rounded-full blur-3xl transition-opacity duration-1000 pointer-events-none ${
              isPlaying ? 'opacity-40 bg-gradient-to-tr from-neon-violet via-neon-cyan to-emerald-400' : 'opacity-10 bg-white/5'
            }`}
          />

          {/* Vinyl Disc Body */}
          <div
            className={`relative flex h-64 w-64 sm:h-84 sm:w-84 md:h-96 md:w-96 items-center justify-center rounded-full bg-[#0a0a12] border-4 border-zinc-800 shadow-[0_20px_60px_rgba(0,0,0,0.9)] transition-all duration-700 ease-in-out`}
            style={{
              backgroundImage:
                'repeating-radial-gradient(circle, #1a1a28 0, #1a1a28 2px, #0b0b14 3px, #0b0b14 5px)',
            }}
          >
            {/* Spinning Grooves Layer */}
            <Disc3
              className={`h-full w-full p-4 animate-spin transition-colors duration-500 ${
                isPlaying ? 'text-neon-cyan/45' : 'text-zinc-700/60'
              }`}
              style={{
                animationDuration: '4s',
                animationPlayState: isPlaying ? 'running' : 'paused',
              }}
            />

            {/* Center Label / Album Cover */}
            <div className="absolute inset-0 m-auto flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-full overflow-hidden border-4 border-zinc-700 shadow-2xl bg-zinc-900">
              {currentTrack?.coverUrl || currentTrack?.thumbnail ? (
                <img
                  src={currentTrack.coverUrl || currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className={`h-full w-full object-cover transition-all duration-700 ${
                    isPlaying ? 'scale-105' : 'grayscale-[30%]'
                  }`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-2">
                  <Radio className="h-6 w-6 text-neon-cyan mb-1" />
                  <span className="font-mono text-[9px] font-bold text-zinc-400">AURASYNC</span>
                </div>
              )}
              {/* Spindle hole */}
              <div className="absolute h-4 w-4 rounded-full bg-black border-2 border-zinc-500 shadow-inner" />
            </div>
          </div>
        </div>

        {/* Track Metadata */}
        <div className="mt-8 text-center max-w-xl px-4">
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <span className={`inline-block led-status ${isPlaying ? 'bg-emerald-400 text-emerald-400' : 'bg-zinc-600 text-zinc-600'}`} />
            <span className="font-mono text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
              {isPlaying ? 'VINYL_TURNTABLE // SPINNING' : 'VINYL_TURNTABLE // PAUSED'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight truncate drop-shadow-[0_2px_16px_rgba(0,0,0,0.85)]">
            {currentTrack?.title || 'CHƯA CHỌN BÀI HÁT'}
          </h2>
          <p className="mt-1 font-mono text-xs sm:text-sm text-neon-cyan/85 tracking-wider truncate uppercase">
            {currentTrack?.artist || 'Phòng thu Retro Hi-Fi Cyberdeck'}
          </p>

          {/* VFD Digital Clock */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-black/60 border border-white/10 px-3.5 py-1.5 font-mono text-xs sm:text-sm text-neon-cyan shadow-inner">
            <Clock className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse' : ''}`} />
            <span className="font-bold tabular-nums">
              {isPlaying && currentTrack ? formatDuration(currentTime) : '00:00'}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400 tabular-nums">
              {currentTrack ? formatDuration(actualDuration || currentTrack.duration) : '00:00'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center gap-5">
          <button
            onClick={() => {
              playMechanicalSound('switch');
              if (currentTrack) toggleLikeTrack(currentTrack.id);
            }}
            className={`p-3 rounded-full border border-white/10 bg-white/5 transition hover:scale-110 active:scale-95 cursor-pointer ${
              isLiked ? 'text-rose-500' : 'text-zinc-400 hover:text-white'
            }`}
            title="Thích [F]"
          >
            <Heart className={`h-5 w-5 ${isLiked ? 'fill-rose-500 animate-spring-pop' : ''}`} />
          </button>

          <button
            onClick={() => {
              playMechanicalSound('tape');
              advancePrev();
            }}
            className="p-3 text-zinc-300 hover:text-white transition active:scale-90 cursor-pointer"
            title="Bài trước [P]"
          >
            <SkipBack className="h-6 w-6" />
          </button>

          <button
            onClick={() => {
              playMechanicalSound('switch');
              setPlaying(!isPlaying);
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg shadow-white/25 transition-all duration-150 hover:scale-105 active:scale-95 border border-white/30 cursor-pointer"
            title="Phát / Tạm dừng [Space]"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 fill-black" />
            ) : (
              <Play className="h-6 w-6 fill-black ml-0.5" />
            )}
          </button>

          <button
            onClick={() => {
              playMechanicalSound('tape');
              advanceNext();
            }}
            className="p-3 text-zinc-300 hover:text-white transition active:scale-90 cursor-pointer"
            title="Bài kế tiếp [N]"
          >
            <SkipForward className="h-6 w-6" />
          </button>

          <button
            onClick={() => {
              playMechanicalSound('toggle');
              setVolume(volume === 0 ? 0.8 : 0);
            }}
            className="p-3 rounded-full border border-white/10 bg-white/5 text-zinc-400 hover:text-white transition hover:scale-110 active:scale-95 cursor-pointer"
            title="Mute [M]"
          >
            {volume === 0 ? <VolumeX className="h-5 w-5 text-rose-400" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </main>

      {/* Bottom: Wide Dynamic VU Meter */}
      <footer className="relative z-10 w-full max-w-3xl mx-auto rounded-2xl border border-white/[0.08] bg-black/50 p-3 sm:p-4 backdrop-blur-md shadow-inner">
        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1.5">
          <span>VU MASTER DYNAMIC RANGE [-42 dB ... 0 VU ... +6 dB]</span>
          <span ref={dbTextRef} className="text-zinc-600 font-bold">
            -∞ dB (STANDBY)
          </span>
        </div>
        <div ref={containerRef} className="flex gap-1 h-3 sm:h-3.5 w-full">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-sm bg-zinc-800/40" />
          ))}
        </div>
      </footer>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
