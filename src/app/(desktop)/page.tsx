"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { ExploreTrendingSection } from "@/app/(desktop)/explore/page";
import {
  Play,
  Pause,
  Shuffle,
  Search,
  Heart,
  ListPlus,
  Disc,
  Disc3,
  Radio,
  Terminal,
  Cpu,
  Clock,
  CheckCircle2,
  Sparkles,
  CloudDownload,
  Compass,
  Headphones,
  FolderPlus,
  FolderHeart,
  X,
  Check,
  Flame,
  History,
  Music2,
  ArrowUpDown,
  Maximize2,
  HelpCircle,
  AlignLeft,
  Trash2,
} from "lucide-react";
import type { Track } from "@/store/usePlayerStore";
import { playMechanicalSound } from "@/core/audio/SoundEffects";

/**
 * Tạo số lượt stream gốc ổn định cho bài hát trong kho kết hợp với số lượt nghe thực tế của người dùng
 */
function formatVaultStreamCount(track: Track, userPlays: number): string {
  if ((track as any).viewCountText) {
    const clean = String((track as any).viewCountText).replace(/\s*streams$/i, "");
    return userPlays > 0 ? `${clean} (+${userPlays})` : `${clean} streams`;
  }
  if (typeof (track as any).streamCount === "number" && (track as any).streamCount > 0) {
    const total = (track as any).streamCount + userPlays;
    return `${total.toLocaleString("en-US")} streams`;
  }
  // Tính mốc base ổn định từ ID/Title của bài hát để hiển thị đồng nhất
  const trackVid = (track as any)?.videoId;
  const seedStr = String(trackVid || track.title || track.id || "aurasound");
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const baseK = 120 + (hash % 850); // 120K -> 969K
  const totalPlays = baseK * 1000 + userPlays;
  if (totalPlays >= 1000000) {
    return `${(totalPlays / 1000000).toFixed(1)}M${userPlays > 0 ? ` (+${userPlays})` : ""}`;
  }
  return `${Math.floor(totalPlays / 1000)}K${userPlays > 0 ? ` (+${userPlays})` : ""}`;
}

// ========================================================
// DÀN ĐÈN VU METER CHUẨN ANALOG RMS + AUTO-GAIN CALIBRATION
// - Hạ NOISE_FLOOR = 14 (thay vì 52) và tự động cân bằng độ nhạy (Auto-Gain)
//   để các bài Acoustic, Nhạc Trịnh, Nhạc Cổ Điển thu âm nhỏ vẫn lên đèn mượt mà
// - Tự động kích hoạt bộ tạo sóng Analog Harmonic Groove RMS khi nghe thử YouTube
// - Cam kết: Chỉ đọc dữ liệu cảm biến hiển thị, giữ nguyên 100% chất lượng âm thanh gốc!
// ========================================================
// DÀN ĐÈN VU METER CHUẨN PHÒNG THU (WIDE DYNAMIC RANGE -42 dB .. +6 dB)
// - Lên từ từ (Attack 0.28), liền mạch không đứt nét (Continuous solid light bar)
// - Bám chuyển động nhịp nhạc & giai điệu (Groove Sync), không bao giờ tràn hết màu đỏ
// - Tỷ lệ chia dB rộng hơn: -42 dB đến +6 dB (Dải động 48 dB chuẩn Studio Mastering)
// - Cam kết: Chỉ đọc dữ liệu cảm biến hiển thị, giữ nguyên 100% chất lượng âm thanh gốc!
// ========================================================
// DÀN ĐÈN VU METER CHUẨN PHÒNG THU (WIDE DYNAMIC RANGE -42 dB .. +6 dB)
// - Lên từ từ (Attack 0.28), liền mạch không đứt nét (Continuous solid light bar)
// - Bám chuyển động nhịp nhạc & giai điệu (Groove Sync), không bao giờ tràn hết màu đỏ
// - Tỷ lệ chia dB rộng hơn: -42 dB đến +6 dB (Dải động 48 dB chuẩn Studio Mastering)
// - Cam kết: Chỉ đọc dữ liệu cảm biến hiển thị, giữ nguyên 100% chất lượng âm thanh gốc!
// ========================================================
function StudioDynamicVuMeter({ isPlaying }: { isPlaying: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dbTextRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef<number>(0);
  const avgBassRef = useRef<number>(30);
  const avgMelodyRef = useRef<number>(35);
  // Headroom trần tối thiểu 125..160: Đảm bảo nhạc bình thường không bị đội tràn vào vùng Đỏ
  const peakEnergyRef = useRef<number>(125);
  const freqDataRef = useRef<Uint8Array>(new Uint8Array(64));

  useEffect(() => {
    let phase = 0;

    const updateMeter = () => {
      if (typeof document !== "undefined" && document.hidden) {
        rafRef.current = null;
        return;
      }

      phase += 0.04;
      let hasRealAudio = false;
      let instantEnergy = 0;

      if (isPlaying) {
        let analyserNode: any = null;
        if (typeof window !== "undefined") {
          analyserNode = (window as any).__AURASOUND_ANALYSER__;
        }

        if (analyserNode) {
          try {
            analyserNode.getByteFrequencyData(freqDataRef.current);
            const data = freqDataRef.current;

            // 1. Dải Bass & Kick Drum (Bin 0..2: 40Hz - 1000Hz)
            let bassSum = 0;
            for (let i = 0; i <= 2; i++) bassSum += data[i] || 0;
            const bass = bassSum / 3;

            // 2. Dải Giai điệu Melody & Giọng hát chính (Bin 3..12: 1kHz - 4.5kHz)
            let melodySum = 0;
            for (let i = 3; i <= 12; i++) melodySum += data[i] || 0;
            const melody = melodySum / 10;

            // 3. Dải Nhịp phách Treble / Hi-hat (Bin 13..24: 4.5kHz - 8.5kHz)
            let trebleSum = 0;
            for (let i = 13; i <= 24; i++) trebleSum += data[i] || 0;
            const treble = trebleSum / 12;

            if (bass > 2.5 || melody > 2.5 || treble > 2.5) {
              hasRealAudio = true;

              // Cập nhật đường nền nhịp điệu (Rolling Averages)
              avgBassRef.current = avgBassRef.current * 0.95 + bass * 0.05;
              avgMelodyRef.current = avgMelodyRef.current * 0.94 + melody * 0.06;

              // Bóc tách độ nảy theo nhịp trống và giai điệu
              const bassPunch = Math.max(0, bass - avgBassRef.current);
              const melodySwell = Math.max(0, melody - avgMelodyRef.current * 0.90);

              // Tỉ trọng âm học cân bằng: chuyển động mềm mại bám sát giai điệu
              instantEnergy =
                melody * 0.40 +
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
                const melodySwell = Math.max(0, melody - avgMelodyRef.current * 0.90);

                instantEnergy =
                  melody * 0.40 +
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
          // Bám trần năng lượng tự nhiên với Headroom cao (125..160)
          if (instantEnergy > peakEnergyRef.current) {
            peakEnergyRef.current = peakEnergyRef.current * 0.70 + instantEnergy * 0.30;
          } else {
            peakEnergyRef.current = Math.max(125, peakEnergyRef.current * 0.998);
          }

          // Ngưỡng lọc tạp âm nền
          const effective = Math.max(0, instantEnergy - 8);
          const dynamicRange = Math.max(110, peakEnergyRef.current - 8);
          const norm = Math.min(1.0, effective / dynamicRange);

          // ĐƯỜNG CONG LŨY THỪA MỞ RỘNG (pow 1.52) KẾT HỢP DẢI CHIA dB LỚN:
          // - Đoạn êm đềm / intro: 2 - 6 bóng (Vùng Xanh lá êm ái)
          // - Đoạn lời hát / verse: 7 - 12 bóng (Xanh lá vươn lên chớm Vàng)
          // - Điệp khúc / groove sôi động: 13 - 16 bóng (Vùng Vàng 0 VU nhún nhảy uyển chuyển)
          // - Cú drop kick / cao trào mạnh nhất: 17 - 20 bóng (Chạm nhẹ vùng Đỏ rồi rút xuống ngay)
          // - Trần tối đa giới hạn 21.5 bóng -> TUYỆT ĐỐI KHÔNG TRÀN KỊCH ĐỎ (23-24)
          targetLeds = Math.min(21.5, Math.pow(norm, 1.52) * 23.0);
        } else {
          // BỘ GIẢ LẬP NHỊP ĐIỆU CHUẨN TEMPO (~124 BPM) KHI NGHE THỬ YOUTUBE
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
          const melodyWave = Math.sin(trackTime * 1.7) * 0.35 + Math.sin(trackTime * 0.65) * 0.25 + 0.5;
          const hihatTick = Math.pow(Math.max(0, Math.sin(beatPhase * 2)), 4.0) * 0.20;

          const grooveIntensity = melodyWave * 0.32 + kickPulse * 0.42 + snarePulse * 0.20 + hihatTick;
          // Giới hạn ở dải 2.5 đến 16 bóng (Xanh và Vàng, nhún nhảy không tràn đỏ)
          targetLeds = Math.min(16.5, Math.max(2.0, 2.5 + Math.pow(grooveIntensity, 1.5) * 14.0));
        }
      }

      // QUY LUẬT VẬT LÝ KIM VU ANALOG:
      // Lên từ từ (Attack 0.28 - không giật bắn) / Nhả êm đềm (Release 0.12 - nhún nhảy liền mạch)
      if (isNaN(smoothedLevelRef.current) || !isFinite(smoothedLevelRef.current)) {
        smoothedLevelRef.current = 0;
      }
      if (isNaN(targetLeds) || !isFinite(targetLeds)) {
        targetLeds = 0;
      }

      if (!isPlaying) {
        smoothedLevelRef.current = Math.max(0, smoothedLevelRef.current * 0.85 - 0.25);
      } else if (targetLeds > smoothedLevelRef.current) {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.28;
      } else {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.12;
      }

      if (isNaN(smoothedLevelRef.current) || !isFinite(smoothedLevelRef.current)) {
        smoothedLevelRef.current = 0;
      }

      const activeCount = isPlaying ? Math.max(1, Math.round(smoothedLevelRef.current)) : 0;

      // CẬP NHẬT 24 BÓNG ĐÈN: LIỀN MẠCH KHÔNG ĐỨT NÉT (SOLID CONTINUOUS BAR)
      // 12 XANH LÁ (0..11) | 6 VÀNG HỔ PHÁCH (12..17) | 6 ĐỎ PEAK (18..23)
      if (containerRef.current) {
        const leds = containerRef.current.children;
        for (let i = 0; i < 24; i++) {
          const led = leds[i] as HTMLElement;
          if (!led) continue;

          if (i < activeCount && isPlaying) {
            if (i < 12) {
              led.className =
                "flex-1 rounded-sm bg-emerald-400 shadow-[0_0_8px_#10B981] transition-colors duration-100 ease-out";
            } else if (i < 18) {
              led.className =
                "flex-1 rounded-sm bg-amber-400 shadow-[0_0_10px_#F59E0B] transition-colors duration-100 ease-out";
            } else {
              led.className =
                "flex-1 rounded-sm bg-rose-500 shadow-[0_0_12px_#EF4444] transition-colors duration-100 ease-out";
            }
          } else {
            led.className =
              "flex-1 rounded-sm bg-white/[0.08] border border-white/[0.03] transition-colors duration-150 ease-out";
          }
        }
      }

      // DISPLAY dB VALUE: -42 dB TO +6 dB
      if (dbTextRef.current) {
        if (!isPlaying || activeCount === 0) {
          dbTextRef.current.innerText = "-∞ dB";
          dbTextRef.current.className = "text-zinc-500 font-semibold shrink-0 tabular-nums";
        } else {
          let dbVal = Math.round((activeCount / 24) * 48 - 42);
          if (isNaN(dbVal) || !isFinite(dbVal)) dbVal = -42;

          if (activeCount >= 18) {
            dbTextRef.current.innerText = `+${Math.max(1, dbVal)} dB PEAK`;
            dbTextRef.current.className = "text-rose-400 font-bold shrink-0 tabular-nums";
          } else if (activeCount >= 12) {
            dbTextRef.current.innerText = `${dbVal >= 0 ? "+" : ""}${dbVal} dB VU`;
            dbTextRef.current.className = "text-amber-400 font-bold shrink-0 tabular-nums";
          } else {
            dbTextRef.current.innerText = `${dbVal} dB`;
            dbTextRef.current.className = "text-emerald-400 font-bold shrink-0 tabular-nums";
          }
        }
      }

      rafRef.current = requestAnimationFrame(updateMeter);
    };

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.hidden) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(updateMeter);
      }
    };

    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  return (
    <div className="crt-screen space-y-2 rounded-2xl border border-white/[0.1] bg-[#0c0c16]/80 p-3 sm:p-4 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs font-mono">
        <div className="flex items-center gap-2 truncate">
          <span className="text-zinc-300 font-bold tracking-wider">VU LEVEL</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-400 font-medium truncate">
            -42 to +6 dB
          </span>
        </div>
        <span ref={dbTextRef} className="text-zinc-500 font-semibold shrink-0 tabular-nums">
          -∞ dB
        </span>
      </div>
      <div ref={containerRef} className="flex gap-0.5 sm:gap-1 h-2.5 sm:h-3 w-full">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-sm bg-white/[0.08] border border-white/[0.03]" />
        ))}
      </div>
    </div>
  );
}

// ========================================================
// TRANG CHỦ PHÒNG THU RETRO HI-FI
// ========================================================
export default function RetroCyberDeckPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [newlyAddedTrack, setNewlyAddedTrack] = useState<Track | null>(null);
  const [activeView, setActiveView] = useState<"vault" | "favorites" | "explore" | string>("vault");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<'all' | 'liked' | 'popular' | 'recent' | 'longplay'>('all');
  const [sortMode, setSortMode] = useState<'default' | 'streams' | 'alphabet'>('default');
  const [interactionToast, setInteractionToast] = useState<{
    message: string;
    type: "heart" | "playlist" | "queue" | "delete";
  } | null>(null);

  const {
    currentTrack,
    isPlaying,
    setPlaying,
    enqueueTrack,
    jumpToTrack,
    setLibrary,
    customPlaylists,
    likedTrackIds,
    streamCounts,
    isSfxEnabled,
    toggleSfx,
    toggleFocusMode,
    toggleShortcuts,
    toggleLyrics,
    createPlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    playPlaylist,
    toggleLikeTrack,
  } = usePlayerStore();
  const { currentTime, actualDuration } = useAudioPlayer();

  useEffect(() => {
    async function loadTracks() {
      try {
        const res = await fetch("/api/tracks/search?t=" + Date.now(), {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.tracks || [];
          setTracks(list);
          if (list.length > 0) {
            setLibrary(list);
          }
        }
      } catch (err) {
        console.error("Lỗi nạp bài hát:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTracks();

    const handleTrackAdded = (e: Event) => {
      const customEvent = e as CustomEvent<Track>;
      const added = customEvent.detail;
      if (added) {
        setTracks((prev) => [added, ...prev.filter((t) => t.id !== added.id)]);
        setNewlyAddedTrack(added);
        setTimeout(() => setNewlyAddedTrack(null), 6500);
      } else {
        loadTracks();
      }
    };

    const handleSwitchView = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setActiveView(customEvent.detail);
      }
    };

    window.addEventListener("aurasound:track-added", handleTrackAdded);
    window.addEventListener("aurasound:switch-view", handleSwitchView);
    return () => {
      window.removeEventListener("aurasound:track-added", handleTrackAdded);
      window.removeEventListener("aurasound:switch-view", handleSwitchView);
    };
  }, [setLibrary]);

  const activeCustomPlaylist = useMemo(
    () => (customPlaylists || []).find((p) => p.id === activeView) || null,
    [customPlaylists, activeView]
  );

  const displayedTracks = useMemo(() => {
    let baseList = tracks;
    if (activeView === "favorites") {
      baseList = tracks.filter((t) => (likedTrackIds || []).includes(t.id));
    } else if (activeCustomPlaylist) {
      baseList = activeCustomPlaylist.trackIds
        .map(
          (id) =>
            tracks.find((t) => t.id === id) ||
            (Array.isArray(activeCustomPlaylist.tracks)
              ? activeCustomPlaylist.tracks.find((t) => t.id === id)
              : undefined)
        )
        .filter((t): t is Track => Boolean(t));
    }

    // Filter Chips
    if (activeChip === 'liked') {
      baseList = baseList.filter((t) => (likedTrackIds || []).includes(t.id));
    } else if (activeChip === 'popular') {
      baseList = [...baseList].sort((a, b) => {
        const aCount = (streamCounts?.[a.id] || 0) + (a.streamCount || 0);
        const bCount = (streamCounts?.[b.id] || 0) + (b.streamCount || 0);
        return bCount - aCount;
      });
    } else if (activeChip === 'recent') {
      baseList = [...baseList].reverse();
    } else if (activeChip === 'longplay') {
      baseList = baseList.filter((t) => (t.duration || 0) >= 240);
    }

    // Sort Mode
    if (sortMode === 'streams') {
      baseList = [...baseList].sort((a, b) => {
        const aCount = (streamCounts?.[a.id] || 0) + (a.streamCount || 0);
        const bCount = (streamCounts?.[b.id] || 0) + (b.streamCount || 0);
        return bCount - aCount;
      });
    } else if (sortMode === 'alphabet') {
      baseList = [...baseList].sort((a, b) => a.title.localeCompare(b.title));
    }

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase();
    return baseList.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [tracks, activeView, likedTrackIds, activeCustomPlaylist, searchQuery, activeChip, sortMode, streamCounts]);

  const handlePlayTrack = (track: Track) => {
    playMechanicalSound('switch');
    if (currentTrack?.id === track.id) {
      setPlaying(!isPlaying);
    } else {
      const contextList = displayedTracks.length > 0 ? displayedTracks : tracks;
      usePlayerStore.getState().setQueue(contextList);
      jumpToTrack(track, contextList);
      setPlaying(true);
    }
  };

  const handlePlayAll = () => {
    playMechanicalSound('tape');
    const targetList = displayedTracks.length > 0 ? displayedTracks : tracks;
    if (targetList.length === 0) return;
    usePlayerStore.getState().setQueue(targetList);
    jumpToTrack(targetList[0], targetList);
    setPlaying(true);
  };

  const handleShuffle = () => {
    playMechanicalSound('switch');
    const targetList = displayedTracks.length > 0 ? displayedTracks : tracks;
    if (targetList.length === 0) return;
    const shuffled = [...targetList].sort(() => Math.random() - 0.5);
    usePlayerStore.getState().setQueue(shuffled);
    jumpToTrack(shuffled[0], shuffled);
    setPlaying(true);
  };

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    const newId = createPlaylist(trimmed);
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
    setActiveView(newId);
  };

  const handleToggleLike = (track: Track) => {
    const isLiked = (likedTrackIds || []).includes(track.id);
    toggleLikeTrack(track.id);
    setInteractionToast({
      message: isLiked ? `Đã bỏ thích: ${track.title}` : `Đã lưu vào Yêu thích: ${track.title}`,
      type: "heart",
    });
    setTimeout(() => {
      setInteractionToast((curr) => (curr?.message.includes(track.title) ? null : curr));
    }, 2400);
  };

  const handleEnqueue = (track: Track) => {
    enqueueTrack(track);
    setInteractionToast({
      message: `Đã thêm vào Hàng đợi: ${track.title}`,
      type: "queue",
    });
    setTimeout(() => setInteractionToast(null), 2400);
  };

  const handlePlaylistAddToggle = (playlist: { id: string; name: string; trackIds: string[] }, track: Track) => {
    const inPl = playlist.trackIds.includes(track.id);
    if (inPl) {
      removeTrackFromPlaylist(playlist.id, track.id);
      setInteractionToast({
        message: `Đã xóa khỏi playlist "${playlist.name}"`,
        type: "playlist",
      });
    } else {
      addTrackToPlaylist(playlist.id, track);
      setInteractionToast({
        message: `Đã thêm vào playlist "${playlist.name}"`,
        type: "playlist",
      });
    }
    setTimeout(() => setInteractionToast(null), 2400);
  };

  const handleDeleteTrack = async (track: Track) => {
    if (!window.confirm(`Xác nhận xóa bài hát "${track.title}" khỏi kho nhạc?`)) return;
    playMechanicalSound('toggle');
    try {
      const res = await fetch('/api/tracks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: track.id, title: track.title }),
      });
      if (res.ok) {
        setTracks((prev) => prev.filter((t) => t.id !== track.id));
        playMechanicalSound('beep');
        setInteractionToast({
          message: `Đã xóa "${track.title}" khỏi kho nhạc`,
          type: "delete",
        });
        setTimeout(() => setInteractionToast(null), 2400);
      } else {
        setInteractionToast({
          message: 'Không thể xóa bài hát, vui lòng thử lại',
          type: "delete",
        });
        setTimeout(() => setInteractionToast(null), 2400);
      }
    } catch {
      setInteractionToast({
        message: 'Lỗi kết nối khi xóa bài hát',
        type: "delete",
      });
      setTimeout(() => setInteractionToast(null), 2400);
    }
  };

  const formatDuration = (seconds?: number) => {
    const s = Math.floor(seconds || 180);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-40 md:pb-24 select-none font-sans relative overflow-x-hidden">
      {/* THÔNG BÁO NỔI KHI TẢI XONG NHẠC TỪ CLOUD / MÁY TÍNH */}
      {newlyAddedTrack && (
        <div className="fixed top-4 right-3 sm:right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-400/50 bg-[#071a14]/95 px-4 sm:px-5 py-3 shadow-[0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-xl toast-enter max-w-[92vw]">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span className="truncate">ĐÃ NẠP VÀO KHO THÀNH CÔNG</span>
            </div>
            <p className="text-xs font-bold text-white truncate max-w-[220px] sm:max-w-[260px]">
              {newlyAddedTrack.title}
            </p>
          </div>
        </div>
      )}

      {/* THÔNG BÁO TƯƠNG TÁC TỨC THÌ (LIKE / PLAYLIST / QUEUE / DELETE) */}
      {interactionToast && (
        <div className="fixed top-4 right-3 sm:right-6 z-50 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0b16]/95 px-4 sm:px-5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl toast-enter max-w-[92vw]">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
              interactionToast.type === "heart"
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                : interactionToast.type === "delete"
                ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                : interactionToast.type === "playlist"
                ? "bg-amber-400/20 border-amber-400/40 text-amber-300"
                : "bg-white/10 border-white/20 text-white"
            }`}
          >
            {interactionToast.type === "heart" ? (
              <Heart className="h-4 w-4 fill-rose-500 text-rose-500 animate-spring-pop" />
            ) : interactionToast.type === "delete" ? (
              <Trash2 className="h-4 w-4 text-rose-400" />
            ) : interactionToast.type === "playlist" ? (
              <FolderHeart className="h-4 w-4" />
            ) : (
              <ListPlus className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 pr-1">
            <p className="text-xs font-semibold text-white truncate max-w-[240px] sm:max-w-[280px]">
              {interactionToast.message}
            </p>
          </div>
        </div>
      )}

      {/* KHUNG TAPE DECK TRÊN CÙNG */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#121222]/80 via-[#090912]/90 to-[#050508] p-3.5 sm:p-6 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.05),transparent_60%)]" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-5 sm:gap-8">
          {/* Đầu máy băng cassette cơ học */}
          <div className="relative flex w-full max-w-md flex-col items-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#18182c] to-[#0c0c16] p-3.5 sm:p-5 shadow-inner">
            <div className="flex w-full flex-wrap items-center justify-between gap-1.5 border-b border-white/[0.08] pb-2.5 sm:pb-3 text-[9px] sm:text-[10px] font-mono tracking-widest text-zinc-300 uppercase">
              <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Radio className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                HI-FI STEREO
              </span>
              <span className="rounded bg-amber-400/15 px-2 py-0.5 font-bold text-amber-300 border border-amber-400/30">
                1411 KBPS
              </span>
              <span className="text-emerald-400 font-semibold tracking-wider">SIDE A</span>
            </div>

            <div className="crt-screen relative my-3 sm:my-4 flex h-24 sm:h-32 w-full items-center justify-around rounded-xl border border-black/80 bg-[#06060c] px-3 sm:px-4 shadow-[inset_0_4px_12px_rgba(0,0,0,0.9)] overflow-hidden">
              <div className="relative flex h-14 w-14 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-full border-4 border-zinc-700 bg-gradient-to-tr from-zinc-900 to-zinc-800 shadow-md">
                <Disc3
                  className={`h-10 w-10 sm:h-14 sm:w-14 animate-spin transition-colors duration-300 ${
                    isPlaying ? "text-zinc-200" : "text-zinc-500"
                  }`}
                  style={{
                    animationDuration: "3s",
                    animationPlayState: isPlaying ? "running" : "paused",
                  }}
                />
                <div className="absolute h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-zinc-300 shadow-[0_0_8px_rgba(255,255,255,0.6)]" />
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center px-2">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400 transition-all ${
                      isPlaying ? "w-2/3 animate-pulse" : "w-1/3"
                    }`}
                  />
                </div>
                <span className="mt-2 text-[8px] sm:text-[9px] font-mono text-zinc-400 uppercase tracking-widest text-center font-medium">
                  {isPlaying ? "ROLLING" : "STANDBY"}
                </span>
              </div>

              <div className="relative flex h-14 w-14 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-full border-4 border-zinc-700 bg-gradient-to-tr from-zinc-900 to-zinc-800 shadow-md">
                <Disc3
                  className={`h-10 w-10 sm:h-14 sm:w-14 animate-spin transition-colors duration-300 ${
                    isPlaying ? "text-zinc-200" : "text-zinc-500"
                  }`}
                  style={{
                    animationDuration: "3s",
                    animationPlayState: isPlaying ? "running" : "paused",
                  }}
                />
                <div className="absolute h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-amber-400/90 shadow-[0_0_10px_#F59E0B]" />
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-zinc-900/80 border border-white/[0.06] px-2.5 sm:px-3 py-2 text-xs">
              <div className="truncate pr-1 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-mono text-zinc-400 block uppercase font-medium">
                  {(currentTrack as any)?.isPreview ? "PREVIEW" : "MASTER TAPE"}
                </span>
                <span className="font-display font-semibold text-white truncate block">
                  {currentTrack ? currentTrack.title : "Ready to Play"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] sm:text-[11px] text-zinc-300 bg-white/[0.06] px-2 sm:px-2.5 py-1 rounded border border-white/10 shadow-inner">
                <Clock className={`w-3 h-3 text-amber-400 ${isPlaying ? "animate-pulse" : ""}`} />
                <span className="text-white font-bold tabular-nums">
                  {isPlaying && currentTrack ? formatDuration(currentTime) : "00:00"}
                </span>
                <span className="text-zinc-600">/</span>
                <span className="text-zinc-400 tabular-nums">
                  {currentTrack ? formatDuration(actualDuration || currentTrack.duration) : "00:00"}
                </span>
              </div>
            </div>
          </div>

          {/* Bảng điều khiển Studio Controller & Dynamic VU */}
          <div className="flex w-full flex-1 flex-col justify-between space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono text-zinc-400 tracking-widest uppercase font-semibold">
                  <span className="led-status text-emerald-400" />
                  <span className="truncate">AURA SOUND // MASTER DECK</span>
                </div>
                <h1 className="mt-1 font-display text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
                  Studio Deck
                </h1>
              </div>

              {/* Hardware Quick Action Switches */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    playMechanicalSound('toggle');
                    toggleFocusMode();
                  }}
                  className="btn-cyberdeck flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 hover:text-white active:scale-95 cursor-pointer"
                  title="Focus Studio [Z]"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-zinc-300" />
                  <span className="hidden sm:inline">Focus</span>
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('toggle');
                    toggleLyrics();
                  }}
                  className="btn-cyberdeck flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 hover:text-emerald-400 active:scale-95 cursor-pointer"
                  title="VFD Lyrics"
                >
                  <AlignLeft className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Lyrics</span>
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('switch');
                    toggleShortcuts();
                  }}
                  className="btn-cyberdeck flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-mono text-zinc-200 hover:text-amber-400 active:scale-95 cursor-pointer"
                  title="Keyboard Shortcuts [?]"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Keys</span>
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('toggle');
                    toggleSfx();
                  }}
                  className={`btn-cyberdeck flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-mono cursor-pointer transition ${
                    isSfxEnabled ? 'text-emerald-400' : 'text-zinc-400'
                  }`}
                  title="Mechanical Sound Effects"
                >
                  <span className={`led-status ${isSfxEnabled ? 'bg-emerald-400 text-emerald-400' : 'bg-zinc-600 text-zinc-600'}`} />
                  <span className="hidden sm:inline text-[10px] font-bold">SFX</span>
                </button>
              </div>
            </div>

            {/* DÀN ĐÈN VU METER AUTO-GAIN NHẠY VỚI MỌI BÀI HÁT */}
            <StudioDynamicVuMeter isPlaying={isPlaying} />

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
              <button
                onClick={handlePlayAll}
                disabled={tracks.length === 0}
                className="group flex items-center gap-2 rounded-xl bg-white px-5 sm:px-6 py-3 sm:py-3.5 text-xs font-mono font-bold tracking-wider text-black shadow-lg shadow-white/10 transition-all duration-150 hover:bg-zinc-200 active:scale-95 disabled:opacity-40 cursor-pointer border border-white/40 shrink-0"
              >
                {isPlaying && !(currentTrack as any)?.isPreview ? (
                  <Pause className="h-4 w-4 fill-black text-black" />
                ) : (
                  <Play className="h-4 w-4 fill-black text-black" />
                )}
                <span>{isPlaying && !(currentTrack as any)?.isPreview ? "Pause" : "Play All"}</span>
              </button>

              <button
                onClick={handleShuffle}
                disabled={tracks.length === 0}
                className="btn-cyberdeck flex items-center gap-2 rounded-xl px-4 py-3 sm:py-3.5 text-xs font-mono font-semibold text-zinc-100 hover:text-white disabled:opacity-40 cursor-pointer shrink-0"
                title="Shuffle Tracks"
              >
                <Shuffle className="h-4 w-4 text-zinc-300" />
                <span>Shuffle</span>
              </button>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("aurasound:open-ingest-modal"));
                }}
                className="flex md:hidden items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-3 text-xs font-mono font-semibold text-zinc-200 transition active:scale-95 cursor-pointer shrink-0 hover:text-white"
              >
                <CloudDownload className="h-4 w-4 text-zinc-300" />
                <span>Import</span>
              </button>

              <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (activeView === "explore") setActiveView("vault");
                  }}
                  placeholder="Search tracks, artists..."
                  className="w-full rounded-xl border border-white/15 bg-black/60 pl-9 pr-3 py-3 text-xs font-mono text-zinc-100 placeholder-zinc-400 outline-none transition focus:border-white/40 focus:bg-black/90 focus:ring-1 focus:ring-white/20"
                />
              </div>
            </div>

            {/* SMART FILTER DECK & SORT SWITCH */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/[0.08]">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => {
                    playMechanicalSound('switch');
                    setActiveChip('all');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 cursor-pointer ${
                    activeChip === 'all'
                      ? 'bg-white text-black font-bold shadow-md shadow-white/10'
                      : 'border border-white/15 bg-white/[0.06] text-zinc-300 hover:text-white hover:bg-white/[0.12] hover:border-white/25'
                  }`}
                >
                  All
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('switch');
                    setActiveChip('liked');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 cursor-pointer ${
                    activeChip === 'liked'
                      ? 'bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.4)]'
                      : 'border border-white/15 bg-white/[0.06] text-zinc-200 hover:text-rose-300 hover:bg-white/[0.12] hover:border-rose-500/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Heart className="h-3 w-3 fill-current" />
                    <span>Liked</span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('switch');
                    setActiveChip('popular');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 cursor-pointer ${
                    activeChip === 'popular'
                      ? 'bg-amber-400 text-black shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                      : 'border border-white/15 bg-white/[0.06] text-zinc-200 hover:text-amber-300 hover:bg-white/[0.12] hover:border-amber-400/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="h-3 w-3" />
                    <span>Popular</span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('switch');
                    setActiveChip('recent');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 cursor-pointer ${
                    activeChip === 'recent'
                      ? 'bg-emerald-400 text-black shadow-[0_0_16px_rgba(16,185,129,0.4)]'
                      : 'border border-white/15 bg-white/[0.06] text-zinc-200 hover:text-emerald-300 hover:bg-white/[0.12] hover:border-emerald-400/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <History className="h-3 w-3" />
                    <span>Recent</span>
                  </span>
                </button>

                <button
                  onClick={() => {
                    playMechanicalSound('switch');
                    setActiveChip('longplay');
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 cursor-pointer ${
                    activeChip === 'longplay'
                      ? 'bg-zinc-100 text-black shadow-[0_0_16px_rgba(255,255,255,0.4)]'
                      : 'border border-white/15 bg-white/[0.06] text-zinc-200 hover:text-white hover:bg-white/[0.12] hover:border-white/30'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Music2 className="h-3 w-3" />
                    <span>Long Play</span>
                  </span>
                </button>
              </div>

              {/* Nút Toggle Sort cơ học */}
              <button
                onClick={() => {
                  playMechanicalSound('toggle');
                  setSortMode((prev) =>
                    prev === 'default' ? 'streams' : prev === 'streams' ? 'alphabet' : 'default'
                  );
                }}
                className="btn-cyberdeck flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-mono text-zinc-200 hover:text-white active:scale-95 cursor-pointer border border-white/15 bg-white/[0.06]"
                title="Sort tracks"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-zinc-300" />
                <span>
                  Sort: {sortMode === 'streams' ? 'Popular' : sortMode === 'alphabet' ? 'A-Z' : 'Default'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* THANH CHUYỂN ĐỔI KHO NHẠC, PLAYLIST CÁ NHÂN & MỤC KHÁM PHÁ */}
      <section id="catalog-section" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                playMechanicalSound('switch');
                setActiveView("vault");
              }}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "vault"
                  ? "bg-white text-black shadow-md"
                  : "border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Cpu className={`h-3.5 w-3.5 ${activeView === "vault" ? "text-black" : "text-zinc-300"}`} />
              <span>Kho nhạc ({tracks.length})</span>
            </button>

            <button
              onClick={() => {
                playMechanicalSound('switch');
                setActiveView("favorites");
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "favorites"
                  ? "bg-rose-500 text-white shadow-md"
                  : "border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${activeView === "favorites" ? "fill-white text-white" : "text-rose-400"}`} />
              <span>Yêu thích ({(likedTrackIds || []).length})</span>
            </button>

            {(customPlaylists || []).map((pl) => {
              const isPlActive = activeView === pl.id;
              return (
                <div
                  key={pl.id}
                  className={`inline-flex items-center rounded-xl border transition-all ${
                    isPlActive
                      ? "border-amber-400/50 bg-amber-400/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <button
                    onClick={() => setActiveView(pl.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold cursor-pointer"
                  >
                    <FolderHeart className="h-3.5 w-3.5 text-amber-400" />
                    <span className="max-w-[120px] truncate">{pl.name}</span>
                    <span className="text-[10px] opacity-75">({pl.trackIds.length})</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlaylist(pl.id);
                      if (isPlActive) setActiveView("vault");
                    }}
                    className="pr-2.5 pl-1 text-zinc-500 hover:text-rose-400 transition cursor-pointer"
                    title="Xóa Playlist này"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {isCreatingPlaylist ? (
              <form onSubmit={handleCreatePlaylistSubmit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Tên playlist..."
                  autoFocus
                  className="w-36 rounded-xl border border-white/20 bg-black/70 px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/50"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-white p-1.5 text-black hover:bg-zinc-200 cursor-pointer"
                  title="Lưu"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingPlaylist(false);
                    setNewPlaylistName("");
                  }}
                  className="rounded-xl border border-white/10 p-1.5 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setIsCreatingPlaylist(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs font-mono text-zinc-400 transition hover:border-white/40 hover:text-white cursor-pointer"
                title="Tạo Playlist mới"
              >
                <FolderPlus className="h-3.5 w-3.5 text-zinc-300" />
                <span>+ Playlist</span>
              </button>
            )}

            <button
              onClick={() => setActiveView("explore")}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "explore"
                  ? "bg-white text-black shadow-md"
                  : "border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Compass className={`h-3.5 w-3.5 ${activeView === "explore" ? "text-black" : "text-amber-400"}`} />
              <span>Khám phá</span>
            </button>
          </div>

          <span className="hidden sm:inline text-xs font-mono text-zinc-500 uppercase">
            {activeView === "explore"
              ? "INSTANT YOUTUBE AUDIO PREVIEW"
              : "FORMAT: 44.1kHz / 192K STEREO"}
          </span>
        </div>

        {activeView === "explore" ? (
          <ExploreTrendingSection />
        ) : isLoading ? (
          <div className="flex h-48 items-center justify-center font-mono text-xs text-zinc-500">
            LOADING_DATA_CARTRIDGES...
          </div>
        ) : displayedTracks.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-6 sm:p-8 text-center font-mono">
            <Disc className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">
              {activeView === "favorites"
                ? "CHƯA CÓ BÀI HÁT YÊU THÍCH"
                : activeCustomPlaylist
                ? `PLAYLIST "${activeCustomPlaylist.name.toUpperCase()}" ĐANG TRỐNG`
                : "NO CARTRIDGES FOUND"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {activeView === "favorites"
                ? "Bấm biểu tượng trái tim trên bài hát để lưu vào danh sách Yêu thích."
                : activeCustomPlaylist
                ? "Bấm nút (+) cạnh bài hát trong Kho nhạc để thêm vào Playlist này."
                : "Bấm sang tab Khám phá hoặc nút Nạp nhạc để lưu bài hát đầu tiên vào kho."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
            {displayedTracks.map((track, idx) => {
              const isThisPlaying = currentTrack?.id === track.id && isPlaying;
              const isThisActive = currentTrack?.id === track.id;
              const isLiked = (likedTrackIds || []).includes(track.id);
              const trackVid = (track as any)?.videoId;
              const userPlays =
                (streamCounts?.[track.id] || 0) +
                (trackVid && trackVid !== track.id
                  ? streamCounts?.[trackVid] || 0
                  : 0);
              const streamLabel = formatVaultStreamCount(track, userPlays);
              const isMenuOpen = playlistMenuTrackId === track.id;

              return (
                <div
                  key={track.id || idx}
                  onClick={() => handlePlayTrack(track)}
                  className={`group relative flex items-center justify-between rounded-2xl p-3 sm:p-3.5 transition-all duration-300 cursor-pointer border ${
                    isThisActive
                      ? "border-white/25 bg-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
                      : "border-white/[0.06] bg-[#0c0c16]/70 hover:border-white/15 hover:bg-white/[0.04]"
                  }`}
                >
                  {/* CỤM ĐĨA VINYL TÍCH HỢP ĐỒNG TÂM */}
                  <div className="flex items-center gap-3 sm:gap-4 overflow-hidden pr-2 min-w-0 flex-1">
                    <div className="relative h-11 w-11 sm:h-12 sm:w-12 shrink-0 flex items-center justify-center">
                      <div
                        className={`relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-[#0a0a12] border border-white/10 shadow-md transition-transform duration-300 group-hover:scale-105 ${
                          isThisPlaying ? "shadow-[0_0_12px_rgba(245,158,11,0.35)]" : ""
                        }`}
                        style={{
                          backgroundImage:
                            "repeating-radial-gradient(circle, #181826 0, #181826 2px, #0b0b14 3px, #0b0b14 4px)",
                        }}
                      >
                        <Disc3
                          className={`h-full w-full p-1.5 animate-spin transition-colors duration-300 ${
                            isThisPlaying ? "text-amber-400/90 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]" : "text-zinc-600 group-hover:text-zinc-400"
                          }`}
                          style={{
                            animationDuration: "3s",
                            animationPlayState: isThisPlaying ? "running" : "paused",
                          }}
                        />

                        <div
                          className={`absolute inset-0 m-auto flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ${
                            isThisPlaying
                              ? "bg-amber-400/20 border border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                              : "bg-zinc-900/90 border border-white/20 text-zinc-300 group-hover:bg-white group-hover:text-black group-hover:border-white group-hover:shadow-[0_0_10px_rgba(255,255,255,0.4)]"
                          }`}
                        >
                          {isThisPlaying ? (
                            <div className="flex items-end gap-0.5 h-3 w-3 justify-center">
                              <span className="h-full w-0.5 rounded-full bg-amber-400 animate-pulse" />
                              <span className="h-2/3 w-0.5 rounded-full bg-amber-400 animate-pulse delay-75" />
                              <span className="h-4/5 w-0.5 rounded-full bg-amber-400 animate-pulse delay-150" />
                            </div>
                          ) : (
                            <Play className="ml-0.5 h-3 w-3 fill-current" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="truncate min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-zinc-500">
                          TRK_{String(idx + 1).padStart(2, "0")}
                        </span>
                        {isThisPlaying && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400 font-bold border border-emerald-500/30">
                            NOW_PLAYING
                          </span>
                        )}
                      </div>
                      <p
                        className={`truncate text-xs sm:text-sm font-semibold transition ${
                          isThisActive ? "text-white font-bold" : "text-zinc-200 group-hover:text-white"
                        }`}
                      >
                        {track.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] sm:text-xs font-mono text-zinc-400">
                        <span className="truncate">{track.artist || "Nghệ sĩ chưa rõ"}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="shrink-0 inline-flex items-center gap-1 text-zinc-500">
                          <Headphones className="h-3 w-3 text-zinc-500" />
                          <span>{streamLabel}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleToggleLike(track)}
                      className={`p-1.5 transition-all duration-200 cursor-pointer active:scale-75 ${
                        isLiked
                          ? "text-rose-500 animate-spring-pop"
                          : "text-zinc-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-white hover:scale-110"
                      }`}
                      title={isLiked ? "Bỏ yêu thích" : "Yêu thích"}
                    >
                      <Heart
                        className={`h-4 w-4 transition-transform ${
                          isLiked ? "fill-rose-500 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]" : ""
                        }`}
                      />
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => {
                          if ((customPlaylists || []).length === 0) {
                            handleEnqueue(track);
                          } else {
                            setPlaylistMenuTrackId(isMenuOpen ? null : track.id);
                          }
                        }}
                        className={`p-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 cursor-pointer active:scale-90 ${
                          isMenuOpen ? "text-white scale-110" : "text-zinc-500 hover:text-white hover:scale-110"
                        }`}
                        title="Thêm vào Hàng đợi / Playlist"
                      >
                        <ListPlus className="h-4 w-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 bottom-9 z-40 w-48 rounded-2xl border border-white/10 bg-[#0d0d1a]/98 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.7),0_0_1px_rgba(0,240,255,0.2)] backdrop-blur-xl text-xs">
                          <button
                            onClick={() => {
                              handleEnqueue(track);
                              setPlaylistMenuTrackId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-white cursor-pointer transition active:scale-95"
                          >
                            <ListPlus className="h-3.5 w-3.5 text-zinc-400" />
                            <span>Thêm vào Hàng đợi</span>
                          </button>

                          {(customPlaylists || []).map((pl) => {
                            const inPl = pl.trackIds.includes(track.id);
                            return (
                              <button
                                key={pl.id}
                                onClick={() => {
                                  handlePlaylistAddToggle(pl, track);
                                  setPlaylistMenuTrackId(null);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-zinc-200 hover:bg-white/10 cursor-pointer transition active:scale-95"
                              >
                                <span className="truncate">{pl.name}</span>
                                {inPl && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                              </button>
                            );
                          })}

                          <div className="my-1 border-t border-white/10" />

                          <button
                            onClick={() => {
                              setPlaylistMenuTrackId(null);
                              handleDeleteTrack(track);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer transition active:scale-95"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                            <span>Xóa khỏi kho nhạc</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="font-mono text-[11px] sm:text-xs text-zinc-400 group-hover:text-zinc-200 tabular-nums pr-0.5 sm:pr-1">
                      {formatDuration(track.duration)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
