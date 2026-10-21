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
} from "lucide-react";
import type { Track } from "@/store/usePlayerStore";

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
function StudioDynamicVuMeter({ isPlaying }: { isPlaying: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dbTextRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef<number>(0);
  const rawEnergyRef = useRef<number>(0);
  const adaptiveCeilingRef = useRef<number>(135);
  const freqDataRef = useRef<Uint8Array>(new Uint8Array(64));

  useEffect(() => {
    let phase = 0;

    const updateMeter = () => {
      if (typeof document !== "undefined" && document.hidden) {
        rafRef.current = null;
        return;
      }

      phase += 0.032;
      let hasRealAudio = false;
      let musicalEnergy = 0;

      if (isPlaying) {
        if (typeof window !== "undefined" && (window as any).__AURASOUND_ANALYSER__) {
          try {
            (window as any).__AURASOUND_ANALYSER__.getByteFrequencyData(freqDataRef.current);
            const data = freqDataRef.current;

            let vocalSum = 0;
            for (let i = 2; i <= 16; i++) {
              vocalSum += data[i] || 0;
            }
            const vocalEnergy = vocalSum / 15;
            const bassSupport = ((data[0] || 0) + (data[1] || 0)) * 0.5;
            musicalEnergy = vocalEnergy * 0.68 + bassSupport * 0.32;

            // Chỉ cần có tín hiệu nhỏ (> 4) là nhận diện được ngay cả các bản thu âm nhỏ
            if (musicalEnergy > 4) hasRealAudio = true;
          } catch {}
        }

        if (!hasRealAudio) {
          try {
            const engine = AudioEngine.getInstance();
            const snap = engine.getFrequencySnapshot();
            if (snap && snap.length > 0) {
              let vocalSum = 0;
              for (let i = 2; i <= 16; i++) {
                vocalSum += snap[i] || 0;
              }
              const vocalEnergy = vocalSum / 15;
              const bassSupport = ((snap[0] || 0) + (snap[1] || 0)) * 0.5;
              musicalEnergy = vocalEnergy * 0.68 + bassSupport * 0.32;
              if (musicalEnergy > 4) hasRealAudio = true;
            }
          } catch {}
        }
      }

      let targetLeds = 0;

      if (isPlaying) {
        if (hasRealAudio) {
          rawEnergyRef.current = rawEnergyRef.current * 0.72 + musicalEnergy * 0.28;

          // Hạ NOISE_FLOOR xuống 14 và tự động cân chỉnh trần nhạy (Auto-Gain Ceiling 75..145)
          const NOISE_FLOOR = 14;
          const effective = Math.max(0, rawEnergyRef.current - NOISE_FLOOR);

          if (effective > adaptiveCeilingRef.current * 0.85) {
            adaptiveCeilingRef.current = Math.min(
              155,
              adaptiveCeilingRef.current * 0.9 + effective * 0.15
            );
          } else {
            // Hạ trần từ từ cho các bài thu âm nhỏ để đèn vẫn vươn tới vùng Vàng ấm áp
            adaptiveCeilingRef.current = Math.max(75, adaptiveCeilingRef.current * 0.996);
          }

          const normalized = Math.min(1.0, effective / adaptiveCeilingRef.current);
          targetLeds = Math.max(1.5, Math.pow(normalized, 1.45) * 24);
        } else {
          // Bộ tạo nhịp sóng Analog Harmonic Groove RMS (cho YouTube Preview / Mobile Native Audio)
          const vocalSwell = Math.sin(phase * 0.75) * 0.5 + 0.5;
          const chordWave = Math.sin(phase * 0.38 + 1.2) * 0.5 + 0.5;
          const beatPulse = Math.pow(Math.sin(phase * 1.85) * 0.5 + 0.5, 2.2);
          targetLeds = 3.0 + vocalSwell * 6.5 + chordWave * 3.5 + beatPulse * 4.5;
        }
      }

      if (!isPlaying) {
        smoothedLevelRef.current = Math.max(0, smoothedLevelRef.current * 0.88 - 0.15);
      } else if (targetLeds > smoothedLevelRef.current) {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.16;
      } else {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.08;
      }

      const activeCount = isPlaying ? Math.max(1, Math.round(smoothedLevelRef.current)) : 0;

      if (containerRef.current) {
        const leds = containerRef.current.children;
        for (let i = 0; i < 24; i++) {
          const led = leds[i] as HTMLElement;
          if (!led) continue;

          if (i < activeCount && isPlaying) {
            if (i < 8) {
              led.className =
                "flex-1 rounded-sm bg-emerald-400 shadow-[0_0_8px_#10B981] transition-all duration-150 ease-out";
            } else if (i < 17) {
              led.className =
                "flex-1 rounded-sm bg-amber-400 shadow-[0_0_8px_#F59E0B] transition-all duration-150 ease-out";
            } else {
              led.className =
                "flex-1 rounded-sm bg-rose-500 shadow-[0_0_10px_#EF4444] transition-all duration-150 ease-out";
            }
          } else {
            led.className =
              "flex-1 rounded-sm bg-zinc-800/40 transition-all duration-200 ease-out";
          }
        }
      }

      if (dbTextRef.current) {
        if (!isPlaying || activeCount === 0) {
          dbTextRef.current.innerText = "-∞ dB (STANDBY)";
          dbTextRef.current.className = "text-zinc-600 font-bold shrink-0";
        } else {
          const dbVal = Math.round((activeCount / 24) * 30 - 24);
          if (activeCount >= 17) {
            dbTextRef.current.innerText = `+${Math.max(1, dbVal)} dB (PEAK)`;
            dbTextRef.current.className = "text-rose-400 font-bold shrink-0";
          } else if (activeCount >= 8) {
            dbTextRef.current.innerText = `${dbVal >= 0 ? "+" : ""}${dbVal} dB (0 VU)`;
            dbTextRef.current.className = "text-amber-400 font-bold shrink-0";
          } else {
            dbTextRef.current.innerText = `${dbVal} dB`;
            dbTextRef.current.className = "text-emerald-400 font-bold shrink-0";
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
    <div className="space-y-1.5 rounded-2xl border border-white/[0.08] bg-black/40 p-3 sm:p-4 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 text-[9px] sm:text-[10px] font-mono text-zinc-500">
        <span className="truncate">
          <span className="hidden sm:inline">
            VU METER (AUTO-GAIN RMS BALLISTICS) [8 NORM / 9 GROOVE / 7 PEAK]
          </span>
          <span className="sm:hidden">VU METER [8 NORM / 9 GROOVE / 7 PEAK]</span>
        </span>
        <span ref={dbTextRef} className="text-zinc-600 font-bold shrink-0">
          -∞ dB (STANDBY)
        </span>
      </div>
      <div ref={containerRef} className="flex gap-0.5 sm:gap-1 h-2.5 sm:h-3 w-full">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-sm bg-zinc-800/40" />
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

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase();
    return baseList.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [tracks, activeView, likedTrackIds, activeCustomPlaylist, searchQuery]);

  const handlePlayTrack = (track: Track) => {
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
    const targetList = displayedTracks.length > 0 ? displayedTracks : tracks;
    if (targetList.length === 0) return;
    usePlayerStore.getState().setQueue(targetList);
    jumpToTrack(targetList[0], targetList);
    setPlaying(true);
  };

  const handleShuffle = () => {
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
        <div className="fixed top-4 right-3 sm:right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-400/50 bg-[#071a14]/95 px-4 sm:px-5 py-3 shadow-[0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-xl animate-bounce max-w-[92vw]">
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

      {/* KHUNG TAPE DECK TRÊN CÙNG */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#121222]/80 via-[#090912]/90 to-[#050508] p-3.5 sm:p-6 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.06),transparent_60%)]" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-5 sm:gap-8">
          {/* Đầu máy băng cassette cơ học */}
          <div className="relative flex w-full max-w-md flex-col items-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#18182c] to-[#0c0c16] p-3.5 sm:p-5 shadow-inner">
            <div className="flex w-full flex-wrap items-center justify-between gap-1.5 border-b border-white/[0.08] pb-2.5 sm:pb-3 text-[9px] sm:text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
              <span className="flex items-center gap-1.5 text-neon-cyan">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                HI-FI STEREO TAPE
              </span>
              <span className="rounded bg-neon-violet/20 px-2 py-0.5 font-bold text-white border border-neon-violet/40">
                1411 KBPS
              </span>
              <span className="text-emerald-400">SIDE A / DIRECT</span>
            </div>

            <div className="relative my-3 sm:my-4 flex h-24 sm:h-32 w-full items-center justify-around rounded-xl border border-black/80 bg-[#06060c] px-3 sm:px-4 shadow-[inset_0_4px_12px_rgba(0,0,0,0.9)]">
              <div className="relative flex h-14 w-14 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-full border-4 border-zinc-700 bg-gradient-to-tr from-zinc-900 to-zinc-800 shadow-md">
                <Disc3
                  className={`h-10 w-10 sm:h-14 sm:w-14 text-zinc-400 transition-all ${
                    isPlaying ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "3s" }}
                />
                <div className="absolute h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-neon-cyan/80 shadow-neon-cyan" />
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center px-2">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-all ${
                      isPlaying ? "w-2/3 animate-pulse" : "w-1/3"
                    }`}
                  />
                </div>
                <span className="mt-2 text-[8px] sm:text-[9px] font-mono text-zinc-500 uppercase tracking-widest text-center">
                  {isPlaying ? "TAPE ROLLING" : "DECK STOPPED"}
                </span>
              </div>

              <div className="relative flex h-14 w-14 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-full border-4 border-zinc-700 bg-gradient-to-tr from-zinc-900 to-zinc-800 shadow-md">
                <Disc3
                  className={`h-10 w-10 sm:h-14 sm:w-14 text-zinc-400 transition-all ${
                    isPlaying ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "3s" }}
                />
                <div className="absolute h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-neon-violet/80 shadow-neon-violet" />
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-zinc-900/80 border border-white/[0.06] px-2.5 sm:px-3 py-2 text-xs">
              <div className="truncate pr-1 min-w-0">
                <span className="text-[9px] sm:text-[10px] font-mono text-zinc-500 block uppercase">
                  {(currentTrack as any)?.isPreview ? "YOUTUBE PREVIEW" : "MASTER CASSETTE"}
                </span>
                <span className="font-mono font-bold text-neon-cyan truncate block">
                  {currentTrack ? currentTrack.title : "EMPTY DECK (SẴN SÀNG)"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] sm:text-[11px] text-zinc-300 bg-white/[0.06] px-2 sm:px-2.5 py-1 rounded border border-white/10 shadow-inner">
                <Clock className={`w-3 h-3 text-neon-cyan ${isPlaying ? "animate-pulse" : ""}`} />
                <span className="text-neon-cyan font-bold tabular-nums">
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
            <div>
              <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono text-neon-cyan tracking-wider uppercase">
                <Terminal className="h-4 w-4 shrink-0" />
                <span className="truncate">VAULT_CONTROLLER // V2.6</span>
              </div>
              <h1 className="mt-1 font-display text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
                Studio Tape Rack
              </h1>
            </div>

            {/* DÀN ĐÈN VU METER AUTO-GAIN NHẠY VỚI MỌI BÀI HÁT */}
            <StudioDynamicVuMeter isPlaying={isPlaying} />

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
              <button
                onClick={handlePlayAll}
                disabled={tracks.length === 0}
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-neon-cyan to-neon-violet px-4 sm:px-6 py-3 sm:py-3.5 text-xs font-mono font-bold tracking-wider text-black shadow-lg shadow-neon-cyan/20 transition hover:scale-105 active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                {isPlaying && !(currentTrack as any)?.isPreview ? (
                  <Pause className="h-4 w-4 fill-black" />
                ) : (
                  <Play className="h-4 w-4 fill-black" />
                )}
                <span>[ TAPE_PLAY_ALL ]</span>
              </button>

              <button
                onClick={handleShuffle}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 sm:px-4 py-3 sm:py-3.5 text-xs font-mono text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40 cursor-pointer"
                title="Trộn bài"
              >
                <Shuffle className="h-4 w-4 text-neon-cyan" />
                <span>SHUFFLE</span>
              </button>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("aurasound:open-ingest-modal"));
                }}
                className="flex md:hidden items-center gap-2 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 px-3.5 py-3 text-xs font-mono font-semibold text-neon-cyan transition active:scale-95 cursor-pointer"
              >
                <CloudDownload className="h-4 w-4" />
                <span>NẠP NHẠC</span>
              </button>

              <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (activeView === "explore") setActiveView("vault");
                  }}
                  placeholder="FILTER_TRACK_BY_NAME..."
                  className="w-full rounded-xl border border-white/[0.08] bg-black/50 pl-9 pr-3 py-3 text-xs font-mono text-neon-cyan placeholder-zinc-600 outline-none transition focus:border-neon-cyan/50 focus:bg-black/80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THANH CHUYỂN ĐỔI KHO NHẠC, PLAYLIST CÁ NHÂN & MỤC KHÁM PHÁ */}
      <section id="catalog-section" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveView("vault")}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "vault"
                  ? "bg-white text-black shadow-md"
                  : "border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Cpu className={`h-3.5 w-3.5 ${activeView === "vault" ? "text-black" : "text-neon-cyan"}`} />
              <span>Kho nhạc ({tracks.length})</span>
            </button>

            <button
              onClick={() => setActiveView("favorites")}
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
                      ? "border-neon-violet bg-neon-violet/25 text-white shadow-md"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <button
                    onClick={() => setActiveView(pl.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold cursor-pointer"
                  >
                    <FolderHeart className="h-3.5 w-3.5 text-neon-violet" />
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
                  className="w-36 rounded-xl border border-neon-cyan/50 bg-black/70 px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-neon-cyan p-1.5 text-black hover:opacity-90 cursor-pointer"
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
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-xs font-mono text-zinc-400 transition hover:border-neon-cyan/40 hover:text-neon-cyan cursor-pointer"
                title="Tạo Playlist mới"
              >
                <FolderPlus className="h-3.5 w-3.5 text-neon-cyan" />
                <span>+ Playlist</span>
              </button>
            )}

            <button
              onClick={() => setActiveView("explore")}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                activeView === "explore"
                  ? "bg-neon-cyan text-black shadow-[0_0_20px_rgba(0,240,255,0.3)]"
                  : "border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Compass className={`h-3.5 w-3.5 ${activeView === "explore" ? "text-black" : "text-neon-cyan"}`} />
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
                      ? "border-neon-cyan/40 bg-gradient-to-r from-neon-violet/15 via-[#121222] to-[#0a0a14] shadow-[0_4px_24px_rgba(0,240,255,0.08)]"
                      : "border-white/[0.06] bg-[#0c0c16]/70 hover:border-white/15 hover:bg-white/[0.04]"
                  }`}
                >
                  {/* CỤM ĐĨA VINYL TÍCH HỢP ĐỒNG TÂM */}
                  <div className="flex items-center gap-3 sm:gap-4 overflow-hidden pr-2 min-w-0 flex-1">
                    <div className="relative h-11 w-11 sm:h-12 sm:w-12 shrink-0 flex items-center justify-center">
                      <div
                        className={`relative flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-[#0a0a12] border border-white/10 shadow-md transition-transform duration-300 group-hover:scale-105 ${
                          isThisPlaying ? "shadow-[0_0_14px_rgba(0,240,255,0.35)]" : ""
                        }`}
                        style={{
                          backgroundImage:
                            "repeating-radial-gradient(circle, #181826 0, #181826 2px, #0b0b14 3px, #0b0b14 4px)",
                        }}
                      >
                        <Disc3
                          className={`h-full w-full p-1.5 text-zinc-600 transition-all ${
                            isThisPlaying ? "animate-spin text-neon-cyan/70" : "group-hover:text-zinc-400"
                          }`}
                          style={{ animationDuration: "3s" }}
                        />

                        <div
                          className={`absolute inset-0 m-auto flex h-6 w-6 items-center justify-center rounded-full transition-all duration-200 ${
                            isThisPlaying
                              ? "bg-neon-cyan/20 border border-neon-cyan text-neon-cyan shadow-[0_0_8px_#00F0FF]"
                              : "bg-zinc-900/90 border border-white/20 text-zinc-300 group-hover:bg-neon-cyan group-hover:text-black group-hover:border-neon-cyan group-hover:shadow-[0_0_10px_#00F0FF]"
                          }`}
                        >
                          {isThisPlaying ? (
                            <div className="flex items-end gap-0.5 h-3 w-3 justify-center">
                              <span className="h-full w-0.5 rounded-full bg-neon-cyan animate-pulse" />
                              <span className="h-2/3 w-0.5 rounded-full bg-neon-cyan animate-pulse delay-75" />
                              <span className="h-4/5 w-0.5 rounded-full bg-neon-cyan animate-pulse delay-150" />
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
                          isThisActive ? "text-neon-cyan" : "text-zinc-100 group-hover:text-white"
                        }`}
                      >
                        {track.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] sm:text-xs font-mono text-zinc-400">
                        <span className="truncate">{track.artist || "Nghệ sĩ chưa rõ"}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="shrink-0 inline-flex items-center gap-1 text-zinc-500">
                          <Headphones className="h-3 w-3 text-neon-cyan/70" />
                          <span>{streamLabel}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleLikeTrack(track.id)}
                      className={`p-1.5 transition cursor-pointer ${
                        isLiked
                          ? "text-rose-500"
                          : "text-zinc-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-white"
                      }`}
                      title={isLiked ? "Bỏ yêu thích" : "Yêu thích"}
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-rose-500" : ""}`} />
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => {
                          if ((customPlaylists || []).length === 0) {
                            enqueueTrack(track);
                          } else {
                            setPlaylistMenuTrackId(isMenuOpen ? null : track.id);
                          }
                        }}
                        className="p-1.5 text-zinc-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-neon-cyan transition cursor-pointer"
                        title="Thêm vào Hàng đợi / Playlist"
                      >
                        <ListPlus className="h-4 w-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 bottom-9 z-40 w-48 rounded-2xl border border-white/10 bg-[#0d0d1a]/98 p-2 shadow-2xl backdrop-blur-xl text-xs">
                          <button
                            onClick={() => {
                              enqueueTrack(track);
                              setPlaylistMenuTrackId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-zinc-200 hover:bg-white/10 hover:text-neon-cyan cursor-pointer"
                          >
                            <ListPlus className="h-3.5 w-3.5 text-neon-cyan" />
                            <span>Thêm vào Hàng đợi</span>
                          </button>

                          {(customPlaylists || []).map((pl) => {
                            const inPl = pl.trackIds.includes(track.id);
                            return (
                              <button
                                key={pl.id}
                                onClick={() => {
                                  if (inPl) {
                                    removeTrackFromPlaylist(pl.id, track.id);
                                  } else {
                                    addTrackToPlaylist(pl.id, track);
                                  }
                                  setPlaylistMenuTrackId(null);
                                }}
                                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-zinc-200 hover:bg-white/10 cursor-pointer"
                              >
                                <span className="truncate">{pl.name}</span>
                                {inPl && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                              </button>
                            );
                          })}
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
