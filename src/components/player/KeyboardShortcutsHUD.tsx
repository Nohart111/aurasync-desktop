'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Terminal,
  X,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Heart,
  Maximize2,
  Sliders,
  Sparkles,
  Command,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

export function KeyboardShortcutsHUD() {
  const [mounted, setMounted] = useState(false);
  const [volumeNotice, setVolumeNotice] = useState<{ volume: number } | null>(null);
  const volumeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    currentTrack,
    isPlaying,
    volume,
    likedTrackIds,
    isShortcutsOpen,
    isFocusMode,
    isSfxEnabled,
    setPlaying,
    setVolume,
    advanceNext,
    advancePrev,
    toggleLikeTrack,
    toggleFocusMode,
    toggleShortcuts,
    toggleSfx,
  } = usePlayerStore();

  const { seekTo, currentTime, actualDuration } = useAudioPlayer();
  const prevVolumeRef = useRef<number>(0.8);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Global Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua khi người dùng đang nhập văn bản trong input / textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      // 1. Phím '?' (Shift + '/') -> Bật / tắt bảng HUD
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        playMechanicalSound('switch');
        toggleShortcuts();
        return;
      }

      // 2. Phím ESC -> Tắt HUD hoặc thoát Focus Mode
      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          e.preventDefault();
          playMechanicalSound('toggle');
          toggleShortcuts(false);
          return;
        }
        if (isFocusMode) {
          e.preventDefault();
          playMechanicalSound('toggle');
          toggleFocusMode(false);
          return;
        }
      }

      // 3. Phím 'Z' hoặc 'z' -> Bật/tắt Chế độ Studio Focus Toàn màn hình
      if (e.key === 'z' || e.key === 'Z') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          playMechanicalSound('toggle');
          toggleFocusMode();
          return;
        }
      }

      // 4. Phím 'Space' -> Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        playMechanicalSound('switch');
        setPlaying(!isPlaying);
        return;
      }

      // 5. Tua lùi / tiến 5 giây (ArrowLeft / ArrowRight hoặc J / L)
      if (e.code === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        if (e.shiftKey) {
          // Shift + Left -> Bài trước
          e.preventDefault();
          playMechanicalSound('tape');
          advancePrev();
        } else {
          e.preventDefault();
          playMechanicalSound('switch');
          const targetSec = Math.max(0, currentTime - 5);
          seekTo(targetSec);
        }
        return;
      }

      if (e.code === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        if (e.shiftKey) {
          // Shift + Right -> Bài kế tiếp
          e.preventDefault();
          playMechanicalSound('tape');
          advanceNext();
        } else {
          e.preventDefault();
          playMechanicalSound('switch');
          const maxDur = actualDuration || currentTrack?.duration || 180;
          const targetSec = Math.min(maxDur, currentTime + 5);
          seekTo(targetSec);
        }
        return;
      }

      // 6. Phím 'N' -> Bài kế tiếp
      if (e.key === 'n' || e.key === 'N') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          playMechanicalSound('tape');
          advanceNext();
          return;
        }
      }

      // 7. Phím 'P' -> Bài trước
      if (e.key === 'p' || e.key === 'P') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          playMechanicalSound('tape');
          advancePrev();
          return;
        }
      }

      // 8. Tăng / giảm 5% âm lượng (ArrowUp / ArrowDown)
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        playMechanicalSound('switch');
        const nextVol = Math.min(1, Math.round((volume + 0.05) * 100) / 100);
        setVolume(nextVol);
        setVolumeNotice({ volume: nextVol });
        if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
        volumeTimerRef.current = setTimeout(() => setVolumeNotice(null), 1800);
        return;
      }

      if (e.code === 'ArrowDown') {
        e.preventDefault();
        playMechanicalSound('switch');
        const nextVol = Math.max(0, Math.round((volume - 0.05) * 100) / 100);
        setVolume(nextVol);
        setVolumeNotice({ volume: nextVol });
        if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
        volumeTimerRef.current = setTimeout(() => setVolumeNotice(null), 1800);
        return;
      }

      // 9. Phím 'M' -> Mute / Unmute
      if (e.key === 'm' || e.key === 'M') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          playMechanicalSound('toggle');
          if (volume > 0) {
            prevVolumeRef.current = volume;
            setVolume(0);
            setVolumeNotice({ volume: 0 });
          } else {
            const restored = prevVolumeRef.current || 0.8;
            setVolume(restored);
            setVolumeNotice({ volume: restored });
          }
          if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
          volumeTimerRef.current = setTimeout(() => setVolumeNotice(null), 1800);
          return;
        }
      }

      // 10. Phím 'F' -> Thích / Bỏ thích bài đang phát
      if (e.key === 'f' || e.key === 'F') {
        if (!e.metaKey && !e.ctrlKey && currentTrack) {
          e.preventDefault();
          playMechanicalSound('switch');
          toggleLikeTrack(currentTrack.id);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isPlaying,
    volume,
    currentTime,
    actualDuration,
    currentTrack,
    isShortcutsOpen,
    isFocusMode,
    setPlaying,
    setVolume,
    advanceNext,
    advancePrev,
    seekTo,
    toggleLikeTrack,
    toggleFocusMode,
    toggleShortcuts,
  ]);

  if (!mounted) return null;

  const content = (
    <>
      {/* 1. FLOATING VOLUME HUD KHI TĂNG/GIẢM BẰNG PHÍM MŨI TÊN */}
      {volumeNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0c0c18]/95 px-4 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_12px_rgba(0,240,255,0.25)] backdrop-blur-xl toast-enter select-none font-sans">
          {volumeNotice.volume === 0 ? (
            <VolumeX className="h-4 w-4 text-rose-400" />
          ) : (
            <Volume2 className="h-4 w-4 text-neon-cyan" />
          )}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-white tabular-nums w-10">
              {Math.round(volumeNotice.volume * 100)}%
            </span>
            <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-neon-violet via-neon-cyan to-emerald-400 rounded-full transition-all duration-100"
                style={{ width: `${Math.round(volumeNotice.volume * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. TERMINAL KEYBOARD SHORTCUTS HUD OVERLAY ('?') */}
      {isShortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-3 sm:p-4 select-none font-sans">
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141424]/98 via-[#0b0b14]/98 to-[#050508] p-5 sm:p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.95)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.08),transparent_65%)]" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 shadow-inner">
                  <Terminal className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold font-mono text-white tracking-wide">
                    CYBERDECK_KEYMAP // V2.6
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400">
                    Phím tắt điều khiển cơ học toàn cục
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  toggleShortcuts(false);
                }}
                className="rounded-xl border border-transparent p-1.5 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                title="Đóng [ESC]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Shortcut Grid */}
            <div className="relative z-10 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Phát / Tạm dừng</span>
                <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-2 py-0.5 rounded-lg shadow-sm">
                  Space
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Tua lùi / Tiến 5s</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-1.5 py-0.5 rounded-lg shadow-sm">
                    ←
                  </span>
                  <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-1.5 py-0.5 rounded-lg shadow-sm">
                    →
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Bài kế tiếp</span>
                <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-2 py-0.5 rounded-lg shadow-sm">
                  N
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Bài trước</span>
                <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-2 py-0.5 rounded-lg shadow-sm">
                  P
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Âm lượng (±5%)</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-1.5 py-0.5 rounded-lg shadow-sm">
                    ↑
                  </span>
                  <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-1.5 py-0.5 rounded-lg shadow-sm">
                    ↓
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Bật / Tắt âm (Mute)</span>
                <span className="font-mono text-[11px] font-bold text-zinc-100 bg-white/[0.08] border border-white/20 px-2 py-0.5 rounded-lg shadow-sm">
                  M
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Yêu thích bài đang phát</span>
                <span className="font-mono text-[11px] font-bold text-rose-400 bg-white/10 border border-white/15 px-2 py-0.5 rounded-lg shadow-sm">
                  F
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Focus Studio Mode</span>
                <span className="font-mono text-[11px] font-bold text-neon-violet bg-white/10 border border-white/15 px-2 py-0.5 rounded-lg shadow-sm">
                  Z
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Bật / Tắt bảng phím tắt này</span>
                <span className="font-mono text-[11px] font-bold text-amber-400 bg-white/10 border border-white/15 px-2 py-0.5 rounded-lg shadow-sm">
                  ?
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5 px-3">
                <span className="text-zinc-300">Âm thanh cơ học SFX</span>
                <button
                  onClick={() => {
                    playMechanicalSound('toggle');
                    toggleSfx();
                  }}
                  className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer transition ${
                    isSfxEnabled
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-zinc-800 border-white/10 text-zinc-500'
                  }`}
                >
                  {isSfxEnabled ? 'SFX: ON' : 'SFX: OFF'}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 mt-5 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <span>Bấm phím [ESC] để đóng</span>
              <span className="text-emerald-400 font-semibold">PURE_AUDIO_PATH: ACTIVE</span>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
