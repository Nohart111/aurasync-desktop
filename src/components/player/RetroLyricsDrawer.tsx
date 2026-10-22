'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Radio,
  Sparkles,
  Music2,
  Sliders,
  AlignLeft,
  Volume2,
} from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { playMechanicalSound } from '@/core/audio/SoundEffects';

interface LyricLine {
  time: number;
  text: string;
}

export function RetroLyricsDrawer() {
  const { currentTrack, isLyricsOpen, toggleLyrics, isPlaying } = usePlayerStore();
  const { currentTime } = useAudioPlayer();
  const activeLineRef = useRef<HTMLDivElement>(null);

  // Giả lập hoặc nạp danh sách câu hát đồng bộ theo thời lượng
  const lyrics: LyricLine[] = useMemo(() => {
    if (!currentTrack) return [];

    // Nếu track có trường lyrics dạng LRC / text
    if (typeof (currentTrack as any).lyricsText === 'string') {
      const lines = (currentTrack as any).lyricsText.split('\n');
      const parsed: LyricLine[] = [];
      lines.forEach((line: string, i: number) => {
        const match = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/);
        if (match) {
          const sec = parseInt(match[1]) * 60 + parseFloat(match[2]);
          parsed.push({ time: sec, text: match[3].trim() });
        } else if (line.trim()) {
          parsed.push({ time: i * 4.5, text: line.trim() });
        }
      });
      if (parsed.length > 0) return parsed;
    }

    // Bộ tạo lời bài hát phong cách Audio Analysis VFD nếu chưa có file lời
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

  // Tìm câu hát đang phát
  const activeIndex = useMemo(() => {
    let currentIdx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        currentIdx = i;
      } else {
        break;
      }
    }
    return currentIdx;
  }, [currentTime, lyrics]);

  // Cuộn mượt đến câu hát đang phát
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  return (
    <AnimatePresence>
      {isLyricsOpen && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 0.8 }}
          className="fixed left-3 right-3 sm:left-auto sm:right-4 top-4 bottom-[8.5rem] md:bottom-28 z-50 flex w-auto sm:w-[26rem] flex-col rounded-3xl border border-white/10 bg-[#070712]/98 p-4 sm:p-5 shadow-[0_24px_64px_rgba(0,0,0,0.85)] backdrop-blur-2xl select-none font-sans"
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
                  Đồng bộ lời bài hát thời gian thực
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                playMechanicalSound('toggle');
                toggleLyrics(false);
              }}
              className="rounded-xl border border-transparent p-1.5 text-zinc-400 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white cursor-pointer"
              title="Đóng [ESC]"
            >
              <X className="h-4 w-4" />
            </button>
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
            <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <Radio className="h-3 w-3 animate-pulse" />
              <span>SYNC_LRC</span>
            </div>
          </div>

          {/* VFD Lyrics Display Area with Phosphor Matrix Feel */}
          <div className="relative flex-1 overflow-y-auto no-scrollbar space-y-4 px-2 py-6 text-center">
            {lyrics.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs">
                <Music2 className="h-8 w-8 mb-2 opacity-40" />
                <span>CHƯA CÓ DỮ LIỆU LỜI BÀI HÁT</span>
              </div>
            ) : (
              lyrics.map((line, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeLineRef : null}
                    className={`transition-all duration-300 font-display ${
                      isActive
                        ? 'text-amber-300 font-bold text-sm sm:text-base scale-105 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                        : Math.abs(idx - activeIndex) <= 2
                        ? 'text-zinc-300/80 text-xs sm:text-sm'
                        : 'text-zinc-600/40 text-xs'
                    }`}
                  >
                    <p className="leading-relaxed">{line.text}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Phosphor Indicator */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1 text-amber-400">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>VFD FLUORESCENT MATRIX</span>
            </span>
            <span>AUTO_SCROLL: ON</span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
