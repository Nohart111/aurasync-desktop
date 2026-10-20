"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioEngine } from "@/core/audio/AudioEngine";
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
} from "lucide-react";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

// ========================================================
// DÀN ĐÈN VU METER CHUẨN ANALOG RMS: LƯỚT ÊM THEO LỜI BÀI HÁT, CHẬM RÃI THƯ THÁI (8 XANH - 9 VÀNG - 7 ĐỎ)
// Tự động ngắt vòng lặp RAF khi màn hình tắt (document.hidden) để tiết kiệm pin & tránh nóng máy
// ========================================================
function StudioDynamicVuMeter({ isPlaying }: { isPlaying: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dbTextRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef<number>(0);
  const rawEnergyRef = useRef<number>(0);
  const freqDataRef = useRef<Uint8Array>(new Uint8Array(64));

  useEffect(() => {
    let phase = 0;

    const updateMeter = () => {
      if (typeof document !== "undefined" && document.hidden) {
        rafRef.current = null;
        return;
      }

      phase += 0.025;
      let hasRealAudio = false;
      let musicalEnergy = 0;

      if (isPlaying) {
        if (typeof window !== "undefined" && (window as any).__AURASOUND_ANALYSER__) {
          try {
            (window as any).__AURASOUND_ANALYSER__.getByteFrequencyData(freqDataRef.current);
            const data = freqDataRef.current;

            let vocalSum = 0;
            for (let i = 2; i <= 12; i++) {
              vocalSum += data[i] || 0;
            }
            const vocalEnergy = vocalSum / 11;
            const bassSupport = ((data[0] || 0) + (data[1] || 0)) * 0.5;
            musicalEnergy = vocalEnergy * 0.7 + bassSupport * 0.3;

            if (musicalEnergy > 8) hasRealAudio = true;
          } catch {}
        }

        if (!hasRealAudio) {
          try {
            const engine = AudioEngine.getInstance();
            const snap = engine.getFrequencySnapshot();
            if (snap && snap.length > 0) {
              let vocalSum = 0;
              for (let i = 2; i <= 12; i++) {
                vocalSum += snap[i] || 0;
              }
              const vocalEnergy = vocalSum / 11;
              const bassSupport = ((snap[0] || 0) + (snap[1] || 0)) * 0.5;
              musicalEnergy = vocalEnergy * 0.7 + bassSupport * 0.3;
              if (musicalEnergy > 8) hasRealAudio = true;
            }
          } catch {}
        }
      }

      let targetLeds = 0;

      if (isPlaying) {
        if (hasRealAudio) {
          rawEnergyRef.current = rawEnergyRef.current * 0.75 + musicalEnergy * 0.25;

          const NOISE_FLOOR = 52;
          const CEILING = 175;
          const EXPONENT = 1.75;

          const effective = Math.max(0, rawEnergyRef.current - NOISE_FLOOR);
          const normalized = Math.min(1.0, effective / CEILING);
          targetLeds = Math.pow(normalized, EXPONENT) * 24;
        } else {
          const vocalSwell = Math.sin(phase * 0.6) * 0.5 + 0.5;
          const chordWave = Math.sin(phase * 0.3) * 0.5 + 0.5;
          targetLeds = 1.0 + vocalSwell * 7.0 + chordWave * 4.0;
        }
      }

      if (!isPlaying) {
        smoothedLevelRef.current = Math.max(0, smoothedLevelRef.current * 0.9 - 0.15);
      } else if (targetLeds > smoothedLevelRef.current) {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.12;
      } else {
        smoothedLevelRef.current += (targetLeds - smoothedLevelRef.current) * 0.07;
      }

      const activeCount = isPlaying ? Math.round(smoothedLevelRef.current) : 0;

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
            VU METER (RMS SLOW BALLISTICS) [8 NORM / 9 GROOVE / 7 PEAK]
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
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [newlyAddedTrack, setNewlyAddedTrack] = useState<Track | null>(null);

  const { currentTrack, isPlaying, setPlaying, enqueueTrack, jumpToTrack } =
    usePlayerStore();
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

    window.addEventListener("aurasound:track-added", handleTrackAdded);
    return () => window.removeEventListener("aurasound:track-added", handleTrackAdded);
  }, []);

  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [tracks, searchQuery]);

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      setPlaying(!isPlaying);
    } else {
      enqueueTrack(track);
      jumpToTrack(track.id);
      setPlaying(true);
    }
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    tracks.forEach((t) => enqueueTrack(t));
    jumpToTrack(tracks[0].id);
    setPlaying(true);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    shuffled.forEach((t) => enqueueTrack(t));
    jumpToTrack(shuffled[0].id);
    setPlaying(true);
  };

  const toggleLike = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
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
                  MASTER CASSETTE
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

            {/* DÀN ĐÈN VU METER TỤT SÂU VỀ XANH & CO GIÃN ĐỘNG */}
            <StudioDynamicVuMeter isPlaying={isPlaying} />

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
              <button
                onClick={handlePlayAll}
                disabled={tracks.length === 0}
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-neon-cyan to-neon-violet px-4 sm:px-6 py-3 sm:py-3.5 text-xs font-mono font-bold tracking-wider text-black shadow-lg shadow-neon-cyan/20 transition hover:scale-105 active:scale-95 disabled:opacity-40"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-black" />
                ) : (
                  <Play className="h-4 w-4 fill-black" />
                )}
                <span>[ TAPE_PLAY_ALL ]</span>
              </button>

              <button
                onClick={handleShuffle}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 sm:px-4 py-3 sm:py-3.5 text-xs font-mono text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                title="Trộn bài"
              >
                <Shuffle className="h-4 w-4 text-neon-cyan" />
                <span>SHUFFLE</span>
              </button>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("aurasound:open-ingest-modal"));
                }}
                className="flex md:hidden items-center gap-2 rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 px-3.5 py-3 text-xs font-mono font-semibold text-neon-cyan transition active:scale-95"
              >
                <CloudDownload className="h-4 w-4" />
                <span>NẠP NHẠC</span>
              </button>

              <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="FILTER_TRACK_BY_NAME..."
                  className="w-full rounded-xl border border-white/[0.08] bg-black/50 pl-9 pr-3 py-3 text-xs font-mono text-neon-cyan placeholder-zinc-600 outline-none transition focus:border-neon-cyan/50 focus:bg-black/80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DANH SÁCH BÀI HÁT AUDIOPHILE CHUYÊN NGHIỆP */}
      <section id="catalog-section" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2 text-[11px] sm:text-xs font-mono text-zinc-400 uppercase">
          <span className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-neon-cyan shrink-0" />
            <span>CATALOG_CARTRIDGES ({filteredTracks.length} TAPES LOADED)</span>
          </span>
          <span className="hidden sm:inline">FORMAT: 44.1kHz / 16-BIT PCM</span>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center font-mono text-xs text-zinc-500">
            LOADING_DATA_CARTRIDGES...
          </div>
        ) : filteredTracks.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-6 sm:p-8 text-center font-mono">
            <Disc className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-400">NO CARTRIDGES FOUND</p>
            <p className="mt-1 text-xs text-zinc-600">
              Bấm nút &quot;Nạp nhạc&quot; để chèn băng nhạc đầu tiên vào kho lưu trữ.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
            {filteredTracks.map((track, idx) => {
              const isThisPlaying = currentTrack?.id === track.id && isPlaying;
              const isThisActive = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.has(track.id);

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
                  <div className="flex items-center gap-3 sm:gap-4 overflow-hidden pr-2 min-w-0">
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

                    <div className="truncate min-w-0">
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
                      <p className="truncate text-[11px] sm:text-xs font-mono text-zinc-400">
                        {track.artist || "Nghệ sĩ chưa rõ"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <button
                      onClick={(e) => toggleLike(e, track.id)}
                      className={`p-1.5 transition ${
                        isLiked
                          ? "text-rose-500"
                          : "text-zinc-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-white"
                      }`}
                      title={isLiked ? "Unlike" : "Like"}
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-rose-500" : ""}`} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        enqueueTrack(track);
                      }}
                      className="p-1.5 text-zinc-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:text-neon-cyan transition"
                      title="Add to Queue"
                    >
                      <ListPlus className="h-4 w-4" />
                    </button>

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
