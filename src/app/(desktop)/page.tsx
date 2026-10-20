"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioEngine } from "@/core/audio/AudioEngine";
import {
  Play,
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
  Trash2,
  FolderPlus,
  ListMusic,
  Plus,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

interface CustomPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
}

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
          dbTextRef.current.className = "text-zinc-600 font-bold";
        } else {
          const dbVal = Math.round((activeCount / 24) * 30 - 24);
          if (activeCount >= 17) {
            dbTextRef.current.innerText = `+${Math.max(1, dbVal)} dB (PEAK)`;
            dbTextRef.current.className = "text-rose-400 font-bold";
          } else if (activeCount >= 8) {
            dbTextRef.current.innerText = `${dbVal >= 0 ? "+" : ""}${dbVal} dB (0 VU)`;
            dbTextRef.current.className = "text-amber-400 font-bold";
          } else {
            dbTextRef.current.innerText = `${dbVal} dB`;
            dbTextRef.current.className = "text-emerald-400 font-bold";
          }
        }
      }

      rafRef.current = requestAnimationFrame(updateMeter);
    };

    rafRef.current = requestAnimationFrame(updateMeter);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="space-y-1.5 rounded-2xl border border-white/[0.08] bg-black/40 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
        <span>VU METER (RMS SLOW BALLISTICS)</span>
        <span ref={dbTextRef} className="text-zinc-600 font-bold">
          -∞ dB (STANDBY)
        </span>
      </div>
      <div ref={containerRef} className="flex gap-1 h-3 w-full">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-sm bg-zinc-800/40" />
        ))}
      </div>
    </div>
  );
}

export default function RetroCyberDeckPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(new Set());
  const [toastInfo, setToastInfo] = useState<{ title: string; subtitle?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<"deck" | "library">("deck");
  const [playlists, setPlaylists] = useState<CustomPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isPlaylistBarExpanded, setIsPlaylistBarExpanded] = useState(true);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
  const [showAddSongsDrawer, setShowAddSongsDrawer] = useState(false);
  const [flashingPlaylistId, setFlashingPlaylistId] = useState<string | null>(null);

  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const store = usePlayerStore() as any;
  const { currentTrack, isPlaying, setPlaying, enqueueTrack } = store;
  const { currentTime, actualDuration } = useAudioPlayer();

  const showToast = (title: string, subtitle?: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastInfo({ title, subtitle });
    toastTimeoutRef.current = setTimeout(() => {
      setToastInfo(null);
    }, 3200);
  };

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
          setTimeout(() => {
            const currentQ = usePlayerStore.getState().queue || [];
            if (currentQ.length === 0 && list.length > 0) {
              usePlayerStore.getState().setQueue(list, "Thư viện chung");
            }
          }, 0);
        }
      } catch (err) {
        console.error("Lỗi nạp bài hát:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTracks();

    const syncLocalPlaylists = () => {
      try {
        const savedPlaylists = localStorage.getItem("aurasound_playlists_v1");
        if (savedPlaylists) setPlaylists(JSON.parse(savedPlaylists));
      } catch {}
    };

    try {
      const savedLikes = localStorage.getItem("aurasound_liked_v1");
      if (savedLikes) setLikedTrackIds(new Set(JSON.parse(savedLikes)));
      syncLocalPlaylists();
    } catch {}

    const handleTrackAdded = (e: Event) => {
      const customEvent = e as CustomEvent<Track>;
      const added = customEvent.detail;
      if (added) {
        setTimeout(() => {
          setTracks((prev) => [added, ...prev.filter((t) => t.id !== added.id)]);
          const st = usePlayerStore.getState();
          if (st.playingPlaylistName === "Thư viện chung" || st.queue.length === 0) {
            st.enqueueTrack(added);
          }
          showToast("Đã thêm vào thư viện", added.title);
        }, 0);
      } else {
        loadTracks();
      }
    };

    const handleViewChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.view) {
        setCurrentView(detail.view);
      }
      if (detail?.playlistId === "CREATE_NEW") {
        setSelectedPlaylistId(null);
        setIsPlaylistBarExpanded(true);
        setIsCreatingInline(true);
      } else if (detail?.playlistId !== undefined) {
        setSelectedPlaylistId(detail.playlistId);
        setIsPlaylistBarExpanded(true);
        setShowAddSongsDrawer(false);
      }
    };

    const handleExternalToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        showToast(detail.message);
      }
    };

    window.addEventListener("aurasound:track-added", handleTrackAdded);
    window.addEventListener("aurasound:view-change", handleViewChange);
    window.addEventListener("aurasound:playlists-updated", syncLocalPlaylists);
    window.addEventListener("aurasound:toast", handleExternalToast);
    return () => {
      window.removeEventListener("aurasound:track-added", handleTrackAdded);
      window.removeEventListener("aurasound:view-change", handleViewChange);
      window.removeEventListener("aurasound:playlists-updated", syncLocalPlaylists);
      window.removeEventListener("aurasound:toast", handleExternalToast);
    };
  }, []);

  const savePlaylists = (updated: CustomPlaylist[]) => {
    setPlaylists(updated);
    try {
      localStorage.setItem("aurasound_playlists_v1", JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("aurasound:playlists-updated"));
    } catch {}
  };

  const handleCreatePlaylist = (e?: React.FormEvent, autoAddTrack?: Track) => {
    if (e) e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;

    const newPl: CustomPlaylist = {
      id: `pl-${Date.now()}`,
      name: trimmed,
      trackIds: autoAddTrack ? [autoAddTrack.id] : [],
      createdAt: new Date().toISOString(),
    };

    const updated = [newPl, ...playlists];
    savePlaylists(updated);
    setNewPlaylistName("");
    setIsCreatingInline(false);

    if (autoAddTrack) {
      showToast(`Đã tạo playlist "${trimmed}"`, `Đã thêm: ${autoAddTrack.title}`);
    } else {
      setSelectedPlaylistId(newPl.id);
      showToast(`Đã tạo playlist "${trimmed}"`);
    }
  };

  const handleDeletePlaylist = (e: React.MouseEvent, pl: CustomPlaylist) => {
    e.stopPropagation();
    const updated = playlists.filter((p) => p.id !== pl.id);
    savePlaylists(updated);
    if (selectedPlaylistId === pl.id) {
      setSelectedPlaylistId(null);
      setShowAddSongsDrawer(false);
    }
    showToast(`Đã xóa playlist "${pl.name}"`);
  };

  const toggleTrackInPlaylist = (playlistId: string, track: Track) => {
    const targetPl = playlists.find((p) => p.id === playlistId);
    if (!targetPl) return;

    const exists = targetPl.trackIds.includes(track.id);
    const updated = playlists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      return {
        ...pl,
        trackIds: exists
          ? pl.trackIds.filter((id) => id !== track.id)
          : [...pl.trackIds, track.id],
      };
    });

    savePlaylists(updated);
    setFlashingPlaylistId(playlistId);
    setTimeout(() => setFlashingPlaylistId(null), 700);

    if (exists) {
      showToast(`Đã gỡ khỏi "${targetPl.name}"`, track.title);
    } else {
      showToast(`Đã thêm vào "${targetPl.name}"`, track.title);
    }

    if (store.playingPlaylistName === targetPl.name) {
      const updatedPl = updated.find((p) => p.id === playlistId);
      if (updatedPl) {
        const plTracks = tracks.filter((t) => updatedPl.trackIds.includes(t.id));
        if (plTracks.length > 0) {
          store.setQueue(plTracks, targetPl.name);
        }
      }
    }
  };

  const handleDeleteTrack = async (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(track.id);
    try {
      const res = await fetch("/api/tracks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, title: track.title, streamUrl: track.streamUrl }),
      });

      if (res.ok) {
        setTracks((prev) => prev.filter((t) => t.id !== track.id));
        store.removeTrackFromQueue(track.id);
        const cleanedPlaylists = playlists.map((pl) => ({
          ...pl,
          trackIds: pl.trackIds.filter((id) => id !== track.id),
        }));
        savePlaylists(cleanedPlaylists);
        showToast("Đã xóa bài hát", track.title);
      }
    } catch (err) {
      console.error("Lỗi xóa bài hát:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const activePlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );

  const currentContextLabel = useMemo(() => {
    if (activePlaylist) return activePlaylist.name;
    if (selectedPlaylistId === "LIKED") return "Yêu thích";
    return "Thư viện chung";
  }, [activePlaylist, selectedPlaylistId]);

  const displayedTracks = useMemo(() => {
    let baseList = tracks;

    if (selectedPlaylistId === "LIKED") {
      baseList = tracks.filter((t) => likedTrackIds.has(t.id));
    } else if (activePlaylist) {
      const idSet = new Set(activePlaylist.trackIds);
      baseList = tracks.filter((t) => idSet.has(t.id));
    }

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase();
    return baseList.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q))
    );
  }, [tracks, selectedPlaylistId, activePlaylist, likedTrackIds, searchQuery]);

  const handlePlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id && store.playingPlaylistName === currentContextLabel) {
      setPlaying(!isPlaying);
    } else {
      store.playTrackNow(track, displayedTracks, currentContextLabel);
    }
  };

  const handlePlayAll = () => {
    if (displayedTracks.length === 0) return;
    store.playTrackNow(displayedTracks[0], displayedTracks, currentContextLabel);
  };

  const handleShuffle = () => {
    if (displayedTracks.length === 0) return;
    const shuffled = [...displayedTracks].sort(() => Math.random() - 0.5);
    store.playTrackNow(shuffled[0], shuffled, `${currentContextLabel} (Trộn bài)`);
  };

  const toggleLike = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    const currentlyLiked = likedTrackIds.has(track.id);
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(track.id);
      else next.add(track.id);
      try {
        localStorage.setItem("aurasound_liked_v1", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    showToast(
      currentlyLiked ? "Đã bỏ khỏi Yêu thích" : "Đã thêm vào Yêu thích",
      track.title
    );
  };

  const formatDuration = (seconds?: number) => {
    const s = Math.floor(seconds || 180);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="space-y-6 pb-16 select-none font-sans relative"
      onClick={() => setOpenMenuTrackId(null)}
    >
      {toastInfo && (
        <div className="fixed top-5 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-[#081512]/95 px-4 py-3 shadow-[0_8px_30px_rgba(16,185,129,0.25)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="pr-1">
            <p className="text-xs font-semibold text-emerald-300">{toastInfo.title}</p>
            {toastInfo.subtitle && (
              <p className="text-[11px] text-zinc-300 truncate max-w-[240px]">
                {toastInfo.subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* KHUNG TAPE DECK TRÊN CÙNG */}
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#121222]/80 via-[#090912]/90 to-[#050508] p-6 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.06),transparent_60%)]" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="relative flex w-full max-w-md flex-col items-center rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#18182c] to-[#0c0c16] p-5 shadow-inner">
            <div className="flex w-full items-center justify-between border-b border-white/[0.08] pb-3 text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
              <span className="flex items-center gap-1.5 text-neon-cyan">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                HI-FI STEREO TAPE
              </span>
              <span className="rounded bg-neon-violet/20 px-2 py-0.5 font-bold text-white border border-neon-violet/40">
                1411 KBPS
              </span>
              <span className="text-emerald-400">SIDE A / DIRECT</span>
            </div>

            <div className="relative my-4 flex h-32 w-full items-center justify-around rounded-xl border border-black/80 bg-[#06060c] px-4 shadow-[inset_0_4px_12px_rgba(0,0,0,0.9)]">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-zinc-700 bg-gradient-to-tr from-zinc-900 to-zinc-800 shadow-md">
                <Disc3
                  className={`h-14 w-14 text-zinc-400 transition-all ${
                    isPlaying ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "3s" }}
                />
                <div className="absolute h-4 w-4 rounded-full bg-neon-cyan/80 shadow-neon-cyan" />
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center px-2">
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden border border-white/5">
                  <div
                    className={`h-full bg-gradient-to-r from-neon-cyan to-neon-violet transition-all ${
                      isPlaying ? "w-2/3 animate-pulse" : "w-1/3"
                    }`}
                  />
                </div>
                <span className="mt-2 text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                  {isPlaying ? "TAPE ROLLING" : "DECK STOPPED"}
                </span>
              </div>

              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-zinc-700 bg-gradient-to-tr from-zinc-900 to-zinc-800 shadow-md">
                <Disc3
                  className={`h-14 w-14 text-zinc-400 transition-all ${
                    isPlaying ? "animate-spin" : ""
                  }`}
                  style={{ animationDuration: "3s" }}
                />
                <div className="absolute h-4 w-4 rounded-full bg-neon-violet/80 shadow-neon-violet" />
              </div>
            </div>

            <div className="flex w-full items-center justify-between rounded-lg bg-zinc-900/80 border border-white/[0.06] px-3 py-2 text-xs">
              <div className="truncate pr-2">
                <span className="text-[10px] font-mono text-zinc-500 block uppercase">
                  {store.playingPlaylistName || "MASTER CASSETTE"}
                </span>
                <span className="font-mono font-bold text-neon-cyan truncate block">
                  {currentTrack ? currentTrack.title : "CHƯA CHỌN BÀI"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] text-zinc-300 bg-white/[0.06] px-2.5 py-1 rounded border border-white/10 shadow-inner">
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

          <div className="flex flex-1 flex-col justify-between space-y-6 w-full">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-neon-cyan tracking-wider uppercase">
                <Terminal className="h-4 w-4" />
                <span>STUDIO DECK // {currentContextLabel.toUpperCase()}</span>
              </div>
              <h1 className="mt-1 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
                {activePlaylist
                  ? activePlaylist.name
                  : selectedPlaylistId === "LIKED"
                  ? "Bài hát yêu thích"
                  : "Studio Tape Rack"}
              </h1>
            </div>

            <StudioDynamicVuMeter isPlaying={isPlaying} />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handlePlayAll}
                disabled={displayedTracks.length === 0}
                className="group flex items-center gap-2 rounded-xl bg-zinc-100 hover:bg-white px-5 py-3 text-xs font-mono font-bold tracking-wider text-black transition active:scale-95 disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-black" />
                <span>PHÁT TẤT CẢ</span>
              </button>

              <button
                onClick={handleShuffle}
                disabled={displayedTracks.length === 0}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-mono text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <Shuffle className="h-4 w-4 text-neon-cyan" />
                <span>TRỘN BÀI</span>
              </button>

              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm bài hát trong danh sách..."
                  className="w-full rounded-xl border border-white/[0.08] bg-black/50 pl-9 pr-3 py-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-500 focus:bg-black/80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* THANH PLAYLIST GỌN GÀNG, CHUYÊN NGHIỆP, CÓ THỂ THU ĐÓNG / MỞ */}
      <section className="rounded-2xl border border-white/[0.07] bg-[#090910]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5 no-scrollbar flex-1 min-w-0">
            <button
              onClick={() => setIsPlaylistBarExpanded(!isPlaylistBarExpanded)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 text-[11px] font-mono text-zinc-300 hover:text-white shrink-0 transition"
              title={isPlaylistBarExpanded ? "Thu gọn thanh Playlist" : "Mở rộng thanh Playlist"}
            >
              <ListMusic className="h-3.5 w-3.5 text-neon-cyan" />
              <span>PLAYLIST</span>
              {isPlaylistBarExpanded ? (
                <ChevronUp className="h-3 w-3 text-zinc-500" />
              ) : (
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              )}
            </button>

            {isPlaylistBarExpanded && (
              <>
                <div className="h-4 w-px bg-zinc-800 shrink-0" />

                <button
                  onClick={() => {
                    setSelectedPlaylistId(null);
                    setShowAddSongsDrawer(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                    selectedPlaylistId === null
                      ? "bg-zinc-100 text-black font-semibold shadow-sm"
                      : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-zinc-800/80"
                  }`}
                >
                  Tất cả ({tracks.length})
                </button>

                <button
                  onClick={() => {
                    setSelectedPlaylistId("LIKED");
                    setShowAddSongsDrawer(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                    selectedPlaylistId === "LIKED"
                      ? "bg-rose-500/20 border border-rose-500/50 text-rose-300 font-semibold"
                      : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-zinc-800/80"
                  }`}
                >
                  <Heart className="h-3 w-3 text-rose-500 fill-rose-500" />
                  <span>Yêu thích ({likedTrackIds.size})</span>
                </button>

                {playlists.map((pl) => {
                  const isSelected = selectedPlaylistId === pl.id;
                  const isFlashing = flashingPlaylistId === pl.id;
                  return (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setSelectedPlaylistId(pl.id);
                        setShowAddSongsDrawer(false);
                      }}
                      className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all shrink-0 border ${
                        isFlashing
                          ? "border-emerald-400 bg-emerald-500/25 text-white scale-105"
                          : isSelected
                          ? "border-neon-cyan/50 bg-neon-cyan/15 text-neon-cyan font-semibold"
                          : "border-zinc-800/80 bg-zinc-900/60 text-zinc-300 hover:text-white hover:bg-zinc-800/80"
                      }`}
                    >
                      <span className="truncate max-w-[130px]">{pl.name}</span>
                      <span className="text-[10px] font-mono opacity-60">({pl.trackIds.length})</span>
                      <button
                        onClick={(e) => handleDeletePlaylist(e, pl)}
                        className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 rounded hover:bg-black/40 text-zinc-400 hover:text-rose-400 transition"
                        title="Xóa playlist"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activePlaylist && (
              <button
                onClick={() => setShowAddSongsDrawer(!showAddSongsDrawer)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  showAddSongsDrawer
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200"
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{showAddSongsDrawer ? "Đóng khay chọn bài" : "Thêm bài vào Playlist"}</span>
              </button>
            )}

            {isCreatingInline ? (
              <form onSubmit={(e) => handleCreatePlaylist(e)} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="Tên playlist..."
                  autoFocus
                  className="w-36 px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-black text-xs font-medium disabled:opacity-40"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingInline(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setIsCreatingInline(true);
                  setIsPlaylistBarExpanded(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-xs text-zinc-300 hover:text-white transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Playlist mới</span>
              </button>
            )}
          </div>
        </div>

        {activePlaylist && showAddSongsDrawer && (
          <div className="mt-3 pt-3 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-zinc-400">
                Chọn bài hát từ thư viện để thêm hoặc gỡ khỏi <strong className="text-white">{activePlaylist.name}</strong>:
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                Đã chọn {activePlaylist.trackIds.length} bài
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
              {tracks.map((t) => {
                const inPl = activePlaylist.trackIds.includes(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTrackInPlaylist(activePlaylist.id, t)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer text-xs transition-all ${
                      inPl
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-zinc-800/70 bg-zinc-900/40 hover:bg-zinc-800/60 text-zinc-300"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{t.artist}</p>
                    </div>
                    <span
                      className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all ${
                        inPl
                          ? "bg-emerald-500 text-black"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {inPl ? (
                        <>
                          <Check className="h-3 w-3" /> Đã thêm
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" /> Thêm
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* DANH SÁCH BÀI HÁT */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 text-xs font-mono text-zinc-400 uppercase">
          <span className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-neon-cyan" />
            {activePlaylist
              ? `PLAYLIST: ${activePlaylist.name} (${displayedTracks.length} BÀI)`
              : selectedPlaylistId === "LIKED"
              ? `YÊU THÍCH (${displayedTracks.length} BÀI)`
              : `DANH SÁCH BĂNG (${displayedTracks.length} BÀI)`}
          </span>
          <span>44.1kHz / STEREO</span>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center font-mono text-xs text-zinc-500">
            Đang tải danh sách nhạc...
          </div>
        ) : displayedTracks.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
            <Disc className="mb-2 h-7 w-7 text-zinc-600" />
            <p className="text-xs text-zinc-400">Chưa có bài hát nào trong mục này.</p>
            {activePlaylist && (
              <button
                onClick={() => setShowAddSongsDrawer(true)}
                className="mt-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Thêm bài hát vào Playlist</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {displayedTracks.map((track, idx) => {
              const isThisPlaying = currentTrack?.id === track.id && isPlaying;
              const isThisActive = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.has(track.id);
              const isMenuOpen = openMenuTrackId === track.id;
              const trackPlaylistsCount = playlists.filter((p) => p.trackIds.includes(track.id)).length;

              return (
                <div
                  key={track.id || idx}
                  onClick={() => handlePlayTrack(track)}
                  className={`group relative flex items-center justify-between rounded-2xl p-3.5 transition-all duration-300 cursor-pointer border ${
                    isThisActive
                      ? "border-neon-cyan/40 bg-gradient-to-r from-neon-violet/15 via-[#121222] to-[#0a0a14] shadow-[0_4px_24px_rgba(0,240,255,0.08)]"
                      : "border-white/[0.06] bg-[#0c0c16]/70 hover:border-white/15 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-4 overflow-hidden pr-2">
                    <div className="relative h-12 w-12 shrink-0 flex items-center justify-center">
                      <div
                        className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0a0a12] border border-white/10 shadow-md transition-transform duration-300 group-hover:scale-105 ${
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
                              : "bg-zinc-900/90 border border-white/20 text-zinc-300 group-hover:bg-neon-cyan group-hover:text-black group-hover:border-neon-cyan"
                          }`}
                        >
                          <Play className="ml-0.5 h-3 w-3 fill-current" />
                        </div>
                      </div>
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-zinc-500">
                          TRK_{String(idx + 1).padStart(2, "0")}
                        </span>
                        {isThisPlaying && (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400 font-bold border border-emerald-500/30">
                            PLAYING
                          </span>
                        )}
                      </div>
                      <p
                        className={`truncate text-sm font-semibold transition ${
                          isThisActive ? "text-neon-cyan" : "text-zinc-100 group-hover:text-white"
                        }`}
                      >
                        {track.title}
                      </p>
                      <p className="truncate text-xs font-mono text-zinc-400">
                        {track.artist || "Nghệ sĩ chưa rõ"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => toggleLike(e, track)}
                      className={`p-1.5 transition ${
                        isLiked
                          ? "text-rose-500"
                          : "text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-white"
                      }`}
                      title="Yêu thích"
                    >
                      <Heart className={`h-4 w-4 ${isLiked ? "fill-rose-500" : ""}`} />
                    </button>

                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuTrackId(isMenuOpen ? null : track.id);
                        }}
                        className={`relative p-1.5 rounded-lg transition ${
                          trackPlaylistsCount > 0 || isMenuOpen
                            ? "text-emerald-400 opacity-100"
                            : "text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-white"
                        }`}
                        title="Thêm vào Playlist"
                      >
                        <FolderPlus className="h-4 w-4" />
                        {trackPlaylistsCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-0.5 rounded-full bg-emerald-500 text-[8px] font-mono font-bold text-black flex items-center justify-center">
                            {trackPlaylistsCount}
                          </span>
                        )}
                      </button>

                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-9 z-40 w-60 rounded-2xl border border-zinc-700 bg-[#0d0d16] p-2.5 shadow-2xl space-y-1.5"
                        >
                          <div className="px-2 py-1 text-[10px] font-mono uppercase text-zinc-400 border-b border-zinc-800 flex items-center justify-between">
                            <span>Chọn Playlist</span>
                            <button
                              onClick={() => setOpenMenuTrackId(null)}
                              className="text-zinc-500 hover:text-white"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>

                          {playlists.length === 0 ? (
                            <p className="px-2 py-2 text-[11px] text-zinc-500 text-center">
                              Tạo playlist mới bên dưới:
                            </p>
                          ) : (
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {playlists.map((pl) => {
                                const inPl = pl.trackIds.includes(track.id);
                                return (
                                  <button
                                    key={pl.id}
                                    onClick={() => toggleTrackInPlaylist(pl.id, track)}
                                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-all ${
                                      inPl
                                        ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium"
                                        : "bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800 border border-transparent"
                                    }`}
                                  >
                                    <span className="truncate pr-2">{pl.name}</span>
                                    {inPl ? (
                                      <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 shrink-0">
                                        <Check className="h-3 w-3" /> Đã thêm
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-0.5 text-[10px] font-mono text-zinc-400 shrink-0">
                                        <Plus className="h-3 w-3" /> Thêm
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <form
                            onSubmit={(e) => {
                              handleCreatePlaylist(e, track);
                              setOpenMenuTrackId(null);
                            }}
                            className="pt-1.5 border-t border-zinc-800 flex items-center gap-1"
                          >
                            <input
                              type="text"
                              value={newPlaylistName}
                              onChange={(e) => setNewPlaylistName(e.target.value)}
                              placeholder="Tạo playlist mới..."
                              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-white placeholder-zinc-500 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={!newPlaylistName.trim()}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-100 text-black text-[11px] font-medium hover:bg-white disabled:opacity-40 shrink-0"
                            >
                              Tạo
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        enqueueTrack(track);
                        showToast("Đã thêm vào hàng đợi phát", track.title);
                      }}
                      className="p-1.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-neon-cyan transition"
                      title="Thêm vào hàng phát"
                    >
                      <ListPlus className="h-4 w-4" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteTrack(e, track)}
                      disabled={deletingId === track.id}
                      className="p-1.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition disabled:opacity-30"
                      title="Xóa bài hát"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <span className="font-mono text-xs text-zinc-400 group-hover:text-zinc-200 tabular-nums pl-1">
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

