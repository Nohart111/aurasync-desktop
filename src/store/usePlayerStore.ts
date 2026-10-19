// src/store/usePlayerStore.ts
import { create } from "zustand";
import { MAX_OUTPUT_GAIN } from "@/core/audio/AudioEngine";
import { DoublyLinkedQueue, Track } from "@/core/algorithms/DoublyLinkedQueue";

const internalQueue = new DoublyLinkedQueue();

interface PlayerState {
  currentTrack: Track | null;
  nextTrackPreview: Track | null;
  queueItems: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  isSyncingToR2: boolean;
  volume: number;
  duration: number;
  setPlaying: (playing: boolean) => void;
  setBuffering: (buffering: boolean) => void;
  setSyncingToR2: (syncing: boolean) => void;
  setDuration: (duration: number) => void;
  setVolume: (vol: number) => void;
  enqueueTrack: (track: Track) => void;
  playTrackNow: (track: Track) => void;
  selectAndPlayTrack: (
    track: Track & { isCachedOnR2?: boolean; externalStreamUrl?: string }
  ) => Promise<void>;
  playNextInQueue: (track: Track) => void;
  removeTrackFromQueue: (trackId: string) => void;
  jumpToTrack: (trackId: string) => void;
  advanceNext: () => Track | null;
  advancePrev: () => Track | null;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  nextTrackPreview: null,
  queueItems: [],
  isPlaying: false,
  isBuffering: false,
  isSyncingToR2: false,
  volume: 0.85,
  duration: 0,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setSyncingToR2: (isSyncingToR2) => set({ isSyncingToR2 }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) =>
    set({ volume: Math.max(0, Math.min(volume, MAX_OUTPUT_GAIN)) }),

  enqueueTrack: (track) => {
    internalQueue.enqueue(track);
    set({
      currentTrack: internalQueue.getCurrent(),
      nextTrackPreview: internalQueue.peekNext(),
      queueItems: internalQueue.toArray(),
    });
  },

  playTrackNow: (track) => {
    internalQueue.enqueue(track);
    const currentTrack = internalQueue.jumpTo(track.id);
    set({
      currentTrack,
      nextTrackPreview: internalQueue.peekNext(),
      queueItems: internalQueue.toArray(),
      isPlaying: true,
      duration: currentTrack?.duration ?? 0,
    });
  },

  selectAndPlayTrack: async (track) => {
    if (track.isCachedOnR2 && track.streamUrl) {
      get().playTrackNow(track);
      return;
    }

    if (track.externalStreamUrl) {
      const externalUrl = new URL(track.externalStreamUrl);
      const isApplePreview =
        externalUrl.protocol === "https:" &&
        externalUrl.hostname.endsWith(".itunes.apple.com");
      if (isApplePreview) {
        get().playTrackNow({ ...track, streamUrl: track.externalStreamUrl });
        return;
      }
    }

    if (track.streamUrl && !track.r2Key && !track.soundCloudId && !track.youtubeVideoId) {
      get().playTrackNow(track);
      return;
    }

    set({ isSyncingToR2: true });
    try {
      const response = await fetch("/api/tracks/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          bpm: track.bpm,
          coverUrl: track.coverUrl,
          r2Key: track.r2Key,
        }),
      });
      const payload = (await response.json()) as {
        track?: Track & { isCachedOnR2?: boolean };
        error?: string;
      };
      if (!response.ok || !payload.track?.streamUrl) {
        throw new Error(payload.error || "Track is not cached in R2.");
      }
      get().playTrackNow({ ...payload.track, isCachedOnR2: true });
    } finally {
      set({ isSyncingToR2: false });
    }
  },

  playNextInQueue: (track) => {
    internalQueue.insertAfterCurrent(track);
    set({
      nextTrackPreview: internalQueue.peekNext(),
      queueItems: internalQueue.toArray(),
    });
  },

  removeTrackFromQueue: (trackId) => {
    internalQueue.removeById(trackId);
    set({
      currentTrack: internalQueue.getCurrent(),
      nextTrackPreview: internalQueue.peekNext(),
      queueItems: internalQueue.toArray(),
    });
  },

  jumpToTrack: (trackId) => {
    const track = internalQueue.jumpTo(trackId);
    set({
      currentTrack: track,
      nextTrackPreview: internalQueue.peekNext(),
      isPlaying: Boolean(track),
      duration: track?.duration ?? 0,
    });
  },

  advanceNext: () => {
    const next = internalQueue.next();
    set({
      currentTrack: next,
      nextTrackPreview: internalQueue.peekNext(),
      isPlaying: Boolean(next),
      duration: next?.duration ?? 0,
    });
    return next;
  },

  advancePrev: () => {
    const prev = internalQueue.prev();
    set({
      currentTrack: prev,
      nextTrackPreview: internalQueue.peekNext(),
      isPlaying: Boolean(prev),
      duration: prev?.duration ?? 0,
    });
    return prev;
  },
}));
