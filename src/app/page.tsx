"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  AudioLines,
  FileAudio2,
  ListMusic,
  LoaderCircle,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { AmbientBackground } from "@/components/layout/AmbientBackground";
import { CursorSpotlight } from "@/components/layout/CursorSpotlight";
import { MagneticSeekbar } from "@/components/player/MagneticSeekbar";
import { QueueDrawer } from "@/components/layout/QueueDrawer";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useYoutubeSearch } from "@/hooks/useYoutubeSearch";
import { PlaylistSearchEngine } from "@/core/algorithms/PlaylistSearchEngine";
import { getPlayableNCTTrack, searchNCTSongs } from "@/core/services/musicSources";
import {
  youtubeMusic,
} from "@/core/services/youtubeMusic";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";

// Danh sách nhạc stream trực tiếp từ Google Cloud Storage (100% CORS & Range streaming)
const DEMO_TRACKS: Track[] = [
  {
    id: "track-1",
    title: "Neverending Story (Lossless Mix)",
    artist: "Kangaroo MusiQue",
    album: "Neon Horizons",
    duration: 215,
    bpm: 128,
    streamUrl: "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverending_Story.mp3",
    coverUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    dominantColors: ["#8A2BE2", "#00F0FF"] as [string, string],
  },
  {
    id: "track-2",
    title: "Sevish Pulse (Microtonal Ambient)",
    artist: "Sevish",
    album: "Obsidian Dreams",
    duration: 184,
    bpm: 110,
    streamUrl: "https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Sevish_-__nbsp_.mp3",
    coverUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    dominantColors: ["#FF2A85", "#8A2BE2"] as [string, string],
  },
];

const playlistSearch = new PlaylistSearchEngine();
playlistSearch.indexTracks(DEMO_TRACKS);

type SearchSource = "library" | "all" | "apple" | "youtube";

interface AppleSearchTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  artworkUrl100?: string;
}

const YOUTUBE_NOISE_PATTERN =
  /\b(?:cover|karaoke|beat|reaction|slowed|reverb|1\s*hour|1h)\b|nhạc\s*chế/i;

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";
const SOURCE_TABS: { id: SearchSource; label: string }[] = [
  { id: "library", label: "Thư viện Mặc định" },
  { id: "all", label: "All song" },
  { id: "apple", label: "Khám phá V-Pop/US-UK (Apple Music)" },
  { id: "youtube", label: "YouTube Music" },
];

function updateSpotlightTarget(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty(
    "--spotlight-x",
    `${event.clientX - bounds.left}px`
  );
  event.currentTarget.style.setProperty(
    "--spotlight-y",
    `${event.clientY - bounds.top}px`
  );
}

export default function DesktopHome() {
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSource, setSearchSource] = useState<SearchSource>("library");
  const [libraryTracks, setLibraryTracks] = useState<Track[]>(DEMO_TRACKS);
  const [onlineTracks, setOnlineTracks] = useState<Track[]>([]);
  const [searchStatus, setSearchStatus] = useState<{
    key: string;
    loading: boolean;
    error: string;
  }>({ key: "", loading: false, error: "" });
  const [playbackError, setPlaybackError] = useState("");
  const [officialTrackUrl, setOfficialTrackUrl] = useState("");
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [directUrl, setDirectUrl] = useState("");
  const [addError, setAddError] = useState("");
  const [addedMessage, setAddedMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamResolutionRequestRef = useRef(0);
  const previousVolumeRef = useRef(0.85);
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    volume,
    duration,
    setVolume,
    advanceNext,
    advancePrev,
  } = usePlayerStore();
  const {
    progressMV,
    currentTimeMV,
    seekTo,
    startTrackFromGesture,
    togglePlaybackFromGesture,
  } = useAudioPlayer();
  const youtubeSearch = useYoutubeSearch(searchQuery, {
    enabled: searchSource === "youtube",
  });
  const youtubeTracks = youtubeSearch.results
    .filter((result) => {
      if (result.provider === "itunes") return Boolean(result.streamUrl);
      return Boolean(result.videoId) && !YOUTUBE_NOISE_PATTERN.test(result.title);
    })
    .map((result): Track => {
      const videoId = result.videoId;
      return {
        id: result.provider === "itunes" ? `itunes-${result.id}` : `youtube-${videoId}`,
        youtubeVideoId: videoId || undefined,
        title: result.title,
        artist: result.artist,
        album: result.provider === "itunes" ? "iTunes preview" : "YouTube Music",
        duration: result.duration,
        bpm: 0,
        streamUrl: result.streamUrl || "",
        coverUrl: result.coverUrl || FALLBACK_COVER,
        dominantColors: ["#FF2A85", "#00F0FF"],
      };
    });
  const visibleTracks =
    searchSource === "library"
      ? playlistSearch.searchByPrefix(searchQuery)
      : searchQuery.trim()
        ? searchSource === "youtube"
          ? youtubeTracks
          : onlineTracks
        : [];
  const activeSearchKey = `${searchSource}:${searchQuery.trim()}`;
  const isSearchLoading = searchSource === "youtube"
    ? youtubeSearch.isLoading
    : searchSource !== "library" &&
      Boolean(searchQuery.trim()) &&
      searchStatus.key === activeSearchKey &&
      searchStatus.loading;
  const searchError =
    searchSource === "youtube"
      ? youtubeSearch.error
      : searchStatus.key === activeSearchKey
        ? searchStatus.error
        : "";

  useEffect(() => {
    if (searchSource === "library" || searchSource === "youtube") return;

    const query = searchQuery.trim();
    if (!query) return;

    const controller = new AbortController();
    const searchKey = `${searchSource}:${query}`;
    const timeoutId = window.setTimeout(async () => {
      setSearchStatus({ key: searchKey, loading: true, error: "" });

      try {
        if (searchSource === "all") {
          const tracks = await searchNCTSongs(query);
          if (!controller.signal.aborted) setOnlineTracks(tracks);
        } else {
          const response = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=15`,
            { signal: controller.signal }
          );
          if (!response.ok) throw new Error("Apple Music search request failed.");

          const payload = (await response.json()) as {
            results?: AppleSearchTrack[];
          };
          const tracks = (payload.results ?? []).map((track): Track => ({
              id: `itunes-${track.trackId}`,
              title: track.trackName,
              artist: track.artistName,
              album: track.collectionName || "Apple Music preview",
              duration: Math.floor((track.trackTimeMillis ?? 0) / 1000),
              bpm: 0,
              streamUrl: track.previewUrl || "",
              coverUrl:
                track.artworkUrl100?.replace("100x100bb", "600x600bb") ||
                FALLBACK_COVER,
              dominantColors: ["#FF2A85", "#00F0FF"],
            }));
          setOnlineTracks(tracks);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setOnlineTracks([]);
          setSearchStatus({
            key: searchKey,
            loading: false,
            error:
              error instanceof Error
                ? `${error.message} Check the connection and try again.`
                : "Không thể tìm kiếm nhạc trực tuyến.",
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchStatus((current) =>
            current.key === searchKey
              ? { ...current, loading: false }
              : current
          );
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery, searchSource]);

  useEffect(() => {
    playlistSearch.indexTracks(libraryTracks);
  }, [libraryTracks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (!currentTrack && DEMO_TRACKS.length > 0) {
          startTrackFromGesture(DEMO_TRACKS[0]);
        } else {
          togglePlaybackFromGesture();
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekTo(currentTimeMV.get() + 5);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekTo(Math.max(0, currentTimeMV.get() - 5));
      } else if (event.key.toLowerCase() === "m") {
        if (volume > 0) {
          previousVolumeRef.current = volume;
          setVolume(0);
        } else {
          setVolume(previousVolumeRef.current || 0.85);
        }
      } else if (event.key.toLowerCase() === "q") {
        setIsQueueOpen((isOpen) => !isOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentTrack,
    currentTimeMV,
    seekTo,
    setVolume,
    startTrackFromGesture,
    togglePlaybackFromGesture,
    volume,
  ]);

  const toggleMute = () => {
    if (volume > 0) {
      previousVolumeRef.current = volume;
      setVolume(0);
    } else {
      setVolume(previousVolumeRef.current || 0.85);
    }
  };

  const handleTrackPlay = async (track: Track) => {
    const requestId = ++streamResolutionRequestRef.current;
    setPlaybackError("");
    setOfficialTrackUrl("");

    if (track.nctKey) {
      try {
        const fullTrack = await getPlayableNCTTrack(track.nctKey);
        if (!fullTrack.streamUrl) {
          window.alert("Bài hát này hiện chưa có link phát trực tiếp.");
          return;
        }
        if (requestId !== streamResolutionRequestRef.current) return;
        startTrackFromGesture(fullTrack);
      } catch (error) {
        console.error("Lỗi phát nhạc NCT:", error);
      }
      return;
    }

    if (track.youtubeVideoId) {
      window.open(
        `https://www.youtube.com/watch?v=${encodeURIComponent(track.youtubeVideoId)}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    if (!track.id.startsWith("itunes-")) {
      startTrackFromGesture(track);
      return;
    }

    if (track.streamUrl) startTrackFromGesture(track);
    else {
      setPlaybackError("Bài này không có preview iTunes. Có thể mở bản chính thức trên YouTube nếu tìm thấy.");
    }

    try {
      const result = await youtubeMusic.findBestMatch(
        track.artist,
        track.title
      );
      const videoId = result?.videoId;
      if (!result || !videoId) return;
      if (requestId !== streamResolutionRequestRef.current) return;
      setOfficialTrackUrl(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
    } catch (error) {
      if (requestId === streamResolutionRequestRef.current) {
        setPlaybackError(track.streamUrl
          ? "Không thể tìm kiếm YouTube lúc này; preview iTunes vẫn đang phát."
          : error instanceof Error
            ? error.message
            : "Không thể tìm kiếm YouTube lúc này.");
      }
    }
  };

  const handleLocalFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const tracks = files.map((file): Track => {
      const title = file.name.replace(/\.[^.]+$/, "") || file.name;
      return {
        id: `local-${crypto.randomUUID()}`,
        title,
        artist: "Tệp trên thiết bị",
        album: "Thư viện cục bộ",
        duration: 0,
        bpm: 0,
        streamUrl: URL.createObjectURL(file),
        coverUrl: FALLBACK_COVER,
        dominantColors: ["#00F0FF", "#10B981"],
      };
    });

    setLibraryTracks((currentTracks) => {
      const nextTracks = [...currentTracks, ...tracks];
      playlistSearch.indexTracks(nextTracks);
      return nextTracks;
    });
    tracks.forEach((track) => usePlayerStore.getState().enqueueTrack(track));
    setAddedMessage(`${tracks.length} tệp đã được thêm vào hàng đợi.`);
    setAddError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDirectUrlSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError("");
    setAddedMessage("");

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(directUrl.trim());
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Unsupported URL protocol.");
      }
    } catch {
      setAddError("Vui lòng nhập một URL âm thanh hợp lệ bắt đầu bằng http:// hoặc https://.");
      return;
    }

    const encodedFilename = parsedUrl.pathname.split("/").pop() || "";
    let filename = encodedFilename;
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch {
      filename = encodedFilename;
    }
    const title = filename.replace(/\.(mp3|flac|m4a|wav|aac|ogg)$/i, "") || parsedUrl.hostname;
    const track: Track = {
      id: `url-${crypto.randomUUID()}`,
      title,
      artist: parsedUrl.hostname,
      album: "Liên kết trực tiếp",
      duration: 0,
      bpm: 0,
      streamUrl: parsedUrl.toString(),
      coverUrl: FALLBACK_COVER,
      dominantColors: ["#00F0FF", "#FF2A85"],
    };

    setLibraryTracks((currentTracks) => {
      const nextTracks = [...currentTracks, track];
      playlistSearch.indexTracks(nextTracks);
      return nextTracks;
    });
    startTrackFromGesture(track);
    setDirectUrl("");
    setAddedMessage("Đã thêm liên kết và bắt đầu phát.");
  };

  return (
    <main className="relative flex h-screen w-screen flex-col justify-between overflow-hidden p-6">
      <CursorSpotlight />
      <AmbientBackground
        primaryColor={currentTrack?.dominantColors[0] || "#8A2BE2"}
        secondaryColor={currentTrack?.dominantColors[1] || "#00F0FF"}
      />

      <header onPointerMove={updateSpotlightTarget} className="cursor-spotlight-target glass-panel relative z-10 flex items-center justify-between rounded-2xl px-6 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden items-center gap-2.5 border-r border-white/10 pr-4 sm:flex">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-emerald-200/40 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
              <span className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase select-none">PWR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full border border-cyan-100/40 bg-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
              <span className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase select-none">SYNC</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-amber-100/40 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
              <span className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase select-none">DAC</span>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="flex min-w-0 items-baseline whitespace-nowrap">
              <span className="font-mono font-black text-sm tracking-widest text-white">AURASOUND</span>
              <span className="ml-1.5 font-mono text-[11px] tracking-wider text-neon-cyan/70">{"// SYS.01"}</span>
            </h1>
            <div className="hidden h-8 items-end gap-[3px] sm:flex" aria-label="Audio signal activity">
              {[8, 11, 14, 10, 12].map((height, index) => (
                <motion.span
                  key={index}
                  className="w-[3px] origin-bottom rounded-full bg-neon-cyan shadow-[0_0_5px_rgba(0,240,255,0.55)]"
                  style={{ height }}
                  animate={{ scaleY: [0.45, 1, 0.62, 0.9, 0.45] }}
                  transition={{
                    duration: 0.9 + index * 0.12,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.11,
                  }}
                />
              ))}
            </div>
            <div className="hidden items-center gap-1.5 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] tracking-wider text-zinc-400 lg:flex">
              <span>24-BIT / 96kHz</span>
              <span className="font-bold text-neon-cyan">LOSSLESS</span>
            </div>
          </div>
        </div>
        <div className="relative flex items-center gap-3">
          <label className="relative hidden w-64 items-center md:flex">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm bài hát hoặc nghệ sĩ"
              aria-label="Tìm bài hát hoặc nghệ sĩ"
              className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition focus:border-neon-cyan/60 focus:ring-2 focus:ring-neon-cyan/20"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setIsAddPanelOpen((isOpen) => !isOpen);
              setAddError("");
              setAddedMessage("");
            }}
            className="flex h-10 items-center gap-2 rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 px-3 text-sm font-medium text-neon-cyan transition hover:bg-neon-cyan/20"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Thêm Nhạc Của Bạn</span>
            <span className="sm:hidden">Thêm nhạc</span>
          </button>
          {isAddPanelOpen && (
            <div className="glass-acrylic absolute right-0 top-full z-50 mt-3 w-[min(24rem,calc(100vw-2rem))] rounded-xl p-4 shadow-glass-dock">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-white">Thêm nhạc</h2>
                <button
                  type="button"
                  onClick={() => setIsAddPanelOpen(false)}
                  aria-label="Đóng bảng thêm nhạc"
                  className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.flac,.m4a,.wav"
                multiple
                onChange={handleLocalFiles}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 text-sm text-zinc-100 transition hover:border-neon-cyan/50 hover:text-neon-cyan"
              >
                <FileAudio2 className="h-4 w-4" />
                Chọn tệp âm thanh
              </button>
              <form onSubmit={handleDirectUrlSubmit} className="mt-4 space-y-2">
                <label htmlFor="direct-audio-url" className="text-xs font-medium text-zinc-400">
                  Hoặc dán liên kết MP3 / FLAC
                </label>
                <div className="flex gap-2">
                  <input
                    id="direct-audio-url"
                    type="url"
                    value={directUrl}
                    onChange={(event) => setDirectUrl(event.target.value)}
                    placeholder="https://cdn.example.com/track.mp3"
                    required
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-white outline-none focus:border-neon-cyan/60"
                  />
                  <button
                    type="submit"
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-neon-cyan px-3 text-xs font-semibold text-obsidian-950 transition hover:brightness-110"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Phát
                  </button>
                </div>
              </form>
              {addError && <p role="alert" className="mt-3 text-xs text-rose-400">{addError}</p>}
              {addedMessage && <p role="status" className="mt-3 text-xs text-emerald-400">{addedMessage}</p>}
            </div>
          )}
        </div>
      </header>

      <section className="relative z-10 my-6 flex-1 overflow-y-auto pr-2">
        <h2 className="font-display text-xl font-bold text-white mb-4">
          {searchSource === "library" ? "Khám phá Lossless Room" : "Khám phá nhạc trực tuyến"}
        </h2>
        <label className="relative mb-4 flex md:hidden">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm bài hát hoặc nghệ sĩ"
            aria-label="Tìm bài hát hoặc nghệ sĩ"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:border-neon-cyan/60 focus:ring-2 focus:ring-neon-cyan/20"
          />
        </label>
        <div role="tablist" aria-label="Nguồn tìm kiếm nhạc" className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={searchSource === tab.id}
              onClick={() => setSearchSource(tab.id)}
              className={`relative isolate shrink-0 overflow-hidden rounded-lg border px-3 py-2 text-xs font-medium transition ${
                searchSource === tab.id
                  ? "border-neon-cyan/50 text-neon-cyan"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
              }`}
            >
              {searchSource === tab.id && (
                <motion.span
                  layoutId="active-music-source"
                  className="absolute inset-0 -z-10 rounded-lg bg-neon-cyan/10"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                />
              )}
              {tab.label}
            </button>
          ))}
        </div>
        {searchSource !== "library" && !searchQuery.trim() && (
          <p className="mb-4 text-xs text-zinc-500">Nhập từ khóa để tìm nhạc trên {searchSource === "all" ? "NhacCuaTui" : searchSource === "apple" ? "Apple Music" : "YouTube Music"}.</p>
        )}
        {isSearchLoading && (
          <p role="status" className="mb-4 flex items-center gap-2 text-xs text-zinc-400">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-neon-cyan" />
            {youtubeSearch.isRetrying
              ? `Nguồn YouTube chính chậm, đang thử Invidious${youtubeSearch.attempts ? ` (${youtubeSearch.attempts + 1}/3)` : "..."}`
              : "Đang tìm kiếm..."}
          </p>
        )}
        {searchError && <p role="alert" className="mb-4 text-xs text-rose-400">{searchError}</p>}
        {searchError && searchSource === "youtube" && (
          <button
            type="button"
            onClick={youtubeSearch.retry}
            className="mb-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:border-neon-cyan/40 hover:text-neon-cyan"
          >
            Thử tìm lại{youtubeSearch.attempts ? ` (${youtubeSearch.attempts} nguồn đã thử)` : ""}
          </button>
        )}
        {playbackError && <p role="alert" className="mb-4 text-xs text-amber-300">{playbackError}</p>}
        {officialTrackUrl && (
          <a
            href={officialTrackUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-4 inline-flex items-center rounded-lg border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-2 text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/20"
          >
            Mở Official Audio trên YouTube
          </a>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTracks.map((t) => (
            <div
              key={t.id}
              onClick={() => handleTrackPlay(t)}
              onPointerMove={updateSpotlightTarget}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleTrackPlay(t);
              }}
              role="button"
              tabIndex={0}
              className="cursor-spotlight-target glass-panel group relative flex cursor-pointer items-center gap-4 rounded-2xl p-4 transition duration-300 hover:border-neon-cyan/40 hover:bg-white/10"
            >
              <img src={t.coverUrl} alt={t.title} className="h-16 w-16 rounded-xl object-cover shadow-md" />
              <div className="flex-1 truncate">
                <p className="font-display font-semibold text-white group-hover:text-neon-cyan transition">{t.title}</p>
                <p className="text-xs text-zinc-400">{t.artist} • {t.album}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleTrackPlay(t);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neon-cyan text-obsidian-950 shadow-neon-cyan transition hover:scale-110 active:scale-95"
              >
                <Play className="h-4 w-4 fill-current ml-0.5" />
              </button>
            </div>
          ))}
        </div>
        {visibleTracks.length === 0 && !isSearchLoading && !searchError && (searchSource === "library" || Boolean(searchQuery.trim())) && (
          <p className="py-8 text-center text-sm text-zinc-500">Không tìm thấy bài hát phù hợp.</p>
        )}
      </section>

      <footer onPointerMove={updateSpotlightTarget} className="cursor-spotlight-target glass-acrylic relative z-10 flex flex-col gap-2 rounded-2xl px-6 py-3.5 shadow-glass-dock">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-[200px]">
            {currentTrack ? (
              <>
                <img src={currentTrack.coverUrl} alt="" className="h-11 w-11 rounded-lg object-cover" />
                <div className="truncate">
                  <p className="truncate text-sm font-semibold text-white">{currentTrack.title}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-zinc-400">
                    {currentTrack.artist}
                    {isPlaying && <AudioLines className="h-3.5 w-3.5 shrink-0 animate-pulse text-neon-cyan" />}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500">Chưa chọn bài hát</p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={advancePrev}
              aria-label="Bài trước"
              title="Bài trước"
              className="rounded-full p-2 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90"
            >
              <SkipBack className="h-5 w-5 fill-current stroke-[2.25]" />
            </button>
            <button
              onClick={() => {
                if (!currentTrack && DEMO_TRACKS.length > 0) {
                  startTrackFromGesture(DEMO_TRACKS[0]);
                } else {
                  togglePlaybackFromGesture();
                }
              }}
              title={isPlaying ? "Tạm dừng" : "Phát"}
              aria-label={isPlaying ? "Tạm dừng" : "Phát"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform duration-150 hover:scale-105 hover:bg-zinc-200 active:scale-95"
            >
              {isBuffering ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-black stroke-[1.75]" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 fill-current text-black" />
              ) : (
                <Play className="ml-0.5 h-5 w-5 fill-black text-black" />
              )}
            </button>
            <button
              onClick={advanceNext}
              aria-label="Bài tiếp theo"
              title="Bài tiếp theo"
              className="rounded-full p-2 text-zinc-300 transition-all hover:bg-white/10 hover:text-white active:scale-90"
            >
              <SkipForward className="h-5 w-5 fill-current stroke-[2.25]" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleMute}
              title={volume > 0 ? "Tắt tiếng" : "Bật tiếng"}
              aria-label={volume > 0 ? "Tắt tiếng" : "Bật tiếng"}
              className="text-zinc-400 transition hover:text-neon-cyan"
            >
              {volume > 0 ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="Âm lượng"
              className="h-1.5 w-20 cursor-pointer accent-neon-cyan shadow-neon-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/50"
            />
            <button
              onClick={() => setIsQueueOpen(!isQueueOpen)}
              title="Hàng đợi (Q)"
              aria-label="Mở hàng đợi"
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white transition"
            >
              <ListMusic className="h-5 w-5" />
            </button>
          </div>
        </div>

        <MagneticSeekbar
          progressMV={progressMV}
          currentTimeMV={currentTimeMV}
          duration={duration}
          onSeek={seekTo}
        />
      </footer>

      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        onPlayTrack={handleTrackPlay}
      />
    </main>
  );
}
