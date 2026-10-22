'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Radio,
  Sparkles,
  Music2,
  AlignLeft,
  RotateCw,
  SlidersHorizontal,
  Headphones,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

interface LyricLine {
  time: number;
  text: string;
}

type LyricsMode = 'auto' | 'simulation';

export function RetroLyricsDrawer() {
  const { currentTrack, isLyricsOpen, toggleLyrics } = usePlayerStore();
  const { currentTime, seekTo } = useAudioPlayer();

  const activeLineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // States
  const [lyricsMode, setLyricsMode] = useState<LyricsMode>('auto');
  const [isLoading, setIsLoading] = useState(false);
  const [onlineSyncedLyrics, setOnlineSyncedLyrics] = useState<string | null>(null);
  const [onlinePlainLyrics, setOnlinePlainLyrics] = useState<string | null>(null);
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // Hàm tải lời bài hát từ backend API
  const fetchLyrics = useCallback(async (title: string, artist?: string, duration?: number) => {
    if (!title.trim()) return;
    setIsLoading(true);
    setFetchError(false);
    try {
      const params = new URLSearchParams({
        title,
        artist: artist || '',
        duration: duration ? String(Math.round(duration)) : '',
      });
      const res = await fetch(`/api/tracks/lyrics?${params.toString()}`);
      if (!res.ok) throw new Error('API failed');

      const data = await res.json();
      if (data?.success && data?.lyrics) {
        setOnlineSyncedLyrics(data.lyrics.syncedLyrics || null);
        setOnlinePlainLyrics(data.lyrics.plainLyrics || null);
        setIsInstrumental(Boolean(data.lyrics.instrumental));
      } else {
        setOnlineSyncedLyrics(null);
        setOnlinePlainLyrics(null);
        setIsInstrumental(false);
        setFetchError(true);
      }
    } catch {
      setOnlineSyncedLyrics(null);
      setOnlinePlainLyrics(null);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Tự động fetch lời bài hát khi mở Drawer hoặc khi chuyển Track
  useEffect(() => {
    if (!currentTrack || !isLyricsOpen) return;

    // Nếu bài hát đã có sẵn lyricsText trong metadata
    if (typeof (currentTrack as any).lyricsText === 'string') {
      setOnlineSyncedLyrics((currentTrack as any).lyricsText);
      setOnlinePlainLyrics(null);
      setIsInstrumental(false);
      return;
    }

    fetchLyrics(currentTrack.title, currentTrack.artist, currentTrack.duration);
  }, [currentTrack?.id, currentTrack?.title, isLyricsOpen, fetchLyrics]);

  // Bộ tạo lời mô phỏng âm học VFD nếu không tìm thấy lời online hoặc khi người dùng chọn chế độ mô phỏng
  const simulatedVfdLines: LyricLine[] = useMemo(() => {
    if (!currentTrack) return [];
    const dur = currentTrack.duration || 180;
    const title = currentTrack.title || 'AuraSync Track';
    const artist = currentTrack.artist || 'Hi-Fi Audio Master';

    return [
      { time: 0, text: `[SYSTEM_INIT: ${title.toUpperCase()}]` },
      { time: 4, text: `[ARTIST: ${artist.toUpperCase()}]` },
      { time: 8, text: `[AUDIO_ENCODING: 44.1kHz / 24-BIT STEREO PURE PATH]` },
      { time: 14, text: 'Giai điệu âm học ngân vang trong không gian phòng thu retro...' },
      { time: 22, text: 'Từng nốt nhạc trầm bổng hòa quyện cùng nhịp trống analog...' },
      { time: 30, text: 'Màng loa dao động thuần khiết, không tạp âm nén dynamic...' },
      { time: 38, text: 'Đèn huỳnh quang VFD nhấp nháy đồng bộ theo tần số âm thanh...' },
      { time: 48, text: 'Điệp khúc ngân vang, không gian tràn ngập giai điệu hi-fi...' },
      { time: 58, text: 'Dải âm ấm áp phủ đầy cảm xúc cho người nghe...' },
      { time: 68, text: 'Nhịp phách điện tử bồng bềnh lướt qua dải tần stereo...' },
      { time: 80, text: 'Thanh âm lắng đọng, từng dải bass trầm sâu lắng dịu êm...' },
      { time: 92, text: 'Tận hưởng chất lượng âm thanh thuần bản gốc phòng thu...' },
      { time: 105, text: 'Không gian tĩnh lặng, chỉ còn lại âm nhạc và cảm xúc...' },
      { time: Math.max(120, dur - 15), text: `[OUTRO // KẾT THÚC BẢN THU: ${title.toUpperCase()}]` },
    ];
  }, [currentTrack]);

  // Parse chuỗi LRC thành danh sách các dòng có timestamp
  const parsedSyncedLyrics: LyricLine[] = useMemo(() => {
    const raw = onlineSyncedLyrics;
    if (!raw) return [];

    const lines = raw.split('\n');
    const result: LyricLine[] = [];

    lines.forEach((line) => {
      const match = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
      if (match) {
        const sec = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
        const text = match[3].trim();
        if (text) {
          result.push({ time: sec, text });
        }
      }
    });

    return result.sort((a, b) => a.time - b.time);
  }, [onlineSyncedLyrics]);

  // Danh sách dòng lyric đang hiển thị
  const activeLyrics: LyricLine[] = useMemo(() => {
    if (lyricsMode === 'simulation') {
      return simulatedVfdLines;
    }
    if (parsedSyncedLyrics.length > 0) {
      return parsedSyncedLyrics;
    }
    // Nếu chế độ tự động nhưng không có synced lrc và không có plain lyrics
    if (fetchError && !onlinePlainLyrics && !isInstrumental) {
      return simulatedVfdLines;
    }
    return [];
  }, [lyricsMode, parsedSyncedLyrics, simulatedVfdLines, fetchError, onlinePlainLyrics, isInstrumental]);

  // Xác định câu hát đang phát
  const activeIndex = useMemo(() => {
    if (activeLyrics.length === 0) return -1;
    let currentIdx = 0;
    for (let i = 0; i < activeLyrics.length; i++) {
      if (currentTime >= activeLyrics[i].time) {
        currentIdx = i;
      } else {
        break;
      }
    }
    return currentIdx;
  }, [currentTime, activeLyrics]);

  // Phát hiện người dùng tương tác cuộn để tạm ngắt auto-scroll 4 giây
  const handleScroll = () => {
    isUserScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 4000);
  };

  // Cuộn mượt đến câu hát đang phát
  useEffect(() => {
    if (!isUserScrollingRef.current && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  // Nhảy đến câu hát khi click
  const handleLineClick = (timeSec: number) => {
    playMechanicalSound('toggle');
    seekTo(timeSec);
  };

  return (
    <AnimatePresence>
      {isLyricsOpen && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 0.8 }}
          className="fixed left-3 right-3 sm:left-auto sm:right-4 top-4 bottom-[8.5rem] md:bottom-28 z-50 flex w-auto sm:w-[28rem] flex-col rounded-3xl border border-white/10 bg-[#070712]/98 p-4 sm:p-5 shadow-[0_24px_64px_rgba(0,0,0,0.85)] backdrop-blur-2xl select-none font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] border border-white/15 text-zinc-300">
                <AlignLeft className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
                  VFD_LYRICS // PHOSPHOR
                </h3>
                <p className="text-[10px] font-mono text-zinc-400">
                  {lyricsMode === 'simulation'
                    ? 'Mô phỏng đo lường âm học VFD'
                    : parsedSyncedLyrics.length > 0
                    ? 'Karaoke đồng bộ thời gian thực (LRCLIB)'
                    : 'Đồng bộ lời bài hát'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Nút chuyển đổi Mode (Auto Lời thật vs VFD Analog Simulation) */}
              <button
                onClick={() => {
                  playMechanicalSound('switch');
                  setLyricsMode((prev) => (prev === 'auto' ? 'simulation' : 'auto'));
                }}
                className={`flex items-center gap-1 rounded-xl px-2 py-1 text-[10px] font-mono border transition cursor-pointer ${
                  lyricsMode === 'simulation'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white'
                }`}
                title="Chuyển chế độ Lời thật / Mô phỏng VFD"
              >
                <Layers className="h-3 w-3" />
                <span className="hidden sm:inline">
                  {lyricsMode === 'simulation' ? 'VFD_SIM' : 'AUTO_LRC'}
                </span>
              </button>

              {/* Nút Reload Lời */}
              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  if (currentTrack) {
                    fetchLyrics(currentTrack.title, currentTrack.artist, currentTrack.duration);
                  }
                }}
                disabled={isLoading}
                className="rounded-xl border border-transparent p-1.5 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white cursor-pointer disabled:opacity-50"
                title="Tải lại lời bài hát"
              >
                <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
              </button>

              {/* Nút Đóng */}
              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  toggleLyrics(false);
                }}
                className="rounded-xl border border-transparent p-1.5 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white cursor-pointer ml-1"
                title="Đóng [ESC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Track Header Pill */}
          <div className="my-3 flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-xs">
            <div className="truncate pr-2">
              <span className="font-semibold text-white block truncate">
                {currentTrack?.title || 'Chưa chọn bài hát'}
              </span>
              <span className="text-[10px] text-zinc-400 block truncate">
                {currentTrack?.artist || 'Nghệ sĩ chưa rõ'}
              </span>
            </div>

            {/* Badge chỉ số định dạng */}
            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
              {isLoading ? (
                <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
                  <RotateCw className="h-3 w-3 animate-spin" />
                  <span>DÒ TẦM SÓNG...</span>
                </span>
              ) : isInstrumental ? (
                <span className="flex items-center gap-1 text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  <Headphones className="h-3 w-3" />
                  <span>INSTRUMENTAL</span>
                </span>
              ) : parsedSyncedLyrics.length > 0 && lyricsMode === 'auto' ? (
                <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                  <Radio className="h-3 w-3 animate-pulse" />
                  <span>SYNC_LRC</span>
                </span>
              ) : onlinePlainLyrics && lyricsMode === 'auto' ? (
                <span className="flex items-center gap-1 text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  <AlignLeft className="h-3 w-3" />
                  <span>PLAIN_TXT</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  <Sparkles className="h-3 w-3" />
                  <span>ANALOG_VFD</span>
                </span>
              )}
            </div>
          </div>

          {/* VFD Lyrics Display Area with Phosphor Matrix Feel */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="relative flex-1 overflow-y-auto no-scrollbar space-y-4 px-2 py-6 text-center select-text"
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs space-y-3">
                <div className="relative flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full border border-amber-500/20 border-t-amber-400 animate-spin" />
                  <Radio className="h-4 w-4 absolute text-amber-400/80 animate-pulse" />
                </div>
                <span className="tracking-wider text-amber-300/80 text-[11px]">
                  KẾT NỐI VỆ TINH PHỤC HỒI LỜI CA KHÚC...
                </span>
              </div>
            ) : isInstrumental && lyricsMode === 'auto' ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 font-mono text-xs space-y-3">
                <Headphones className="h-12 w-12 text-cyan-400 opacity-60 animate-bounce" />
                <span className="text-white font-semibold text-sm">BẢN THU THUẦN NHẠC CỤ</span>
                <p className="text-[11px] text-zinc-500 max-w-xs leading-relaxed">
                  Ca khúc không có lời hát. Hãy nhắm mắt và cảm nhận dải âm thanh Stereo Hi-Fi tách bạch!
                </p>
              </div>
            ) : activeLyrics.length > 0 ? (
              activeLyrics.map((line, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => handleLineClick(line.time)}
                    className={`cursor-pointer py-1.5 px-3 rounded-xl transition-all duration-300 font-display ${
                      isActive
                        ? 'text-amber-300 font-bold text-sm sm:text-base scale-105 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)] bg-amber-500/10 border border-amber-500/20'
                        : Math.abs(idx - activeIndex) <= 2
                        ? 'text-zinc-200/90 text-xs sm:text-sm hover:text-amber-200 hover:bg-white/[0.03]'
                        : 'text-zinc-500/40 text-xs hover:text-zinc-300'
                    }`}
                  >
                    <p className="leading-relaxed">{line.text}</p>
                  </div>
                );
              })
            ) : onlinePlainLyrics && lyricsMode === 'auto' ? (
              <div className="space-y-3 py-2 text-zinc-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line text-left px-3 font-sans">
                {onlinePlainLyrics}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs space-y-2">
                <Music2 className="h-8 w-8 opacity-40 text-zinc-500" />
                <span>CHƯA CÓ DỮ LIỆU LỜI BÀI HÁT</span>
                <p className="text-[10px] text-zinc-600">
                  Nhấn vào nút VFD_SIM ở góc trên để kích hoạt mô phỏng quang phổ âm học
                </p>
              </div>
            )}
          </div>

          {/* Footer Phosphor Indicator */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1 text-amber-400">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>VFD FLUORESCENT MATRIX</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-zinc-400">CLICK ĐỂ NHẢY ĐOẠN</span>
              <span className="text-emerald-400">• AUTO_SYNC</span>
            </span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
