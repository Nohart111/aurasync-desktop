// src/store/usePlayerStore.ts
import { create } from "zustand";
import { DoublyLinkedQueue, Track } from "@/core/algorithms/DoublyLinkedQueue";

const internalQueue = new DoublyLinkedQueue();

interface PlayerState {
  currentTrack: Track | null;
  nextTrackPreview: Track | null;
  queueItems: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  duration: number;
  setPlaying: (playing: boolean) => void;
  setBuffering: (buffering: boolean) => void;
  setDuration: (duration: number) => void;
  setVolume: (vol: number) => void;
  enqueueTrack: (track: Track) => void;
  playTrackNow: (track: Track) => void;
  playNextInQueue: (track: Track) => void;
  removeTrackFromQueue: (trackId: string) => void;
  jumpToTrack: (trackId: string) => void;
  advanceNext: () => Track | null;
  advancePrev: () => Track | null;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  nextTrackPreview: null,
  queueItems: [],
  isPlaying: false,
  isBuffering: false,
  volume: 0.85,
  duration: 0,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),

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
