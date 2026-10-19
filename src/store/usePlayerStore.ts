// src/store/usePlayerStore.ts
import { create } from "zustand";
import { DoublyLinkedQueue, Track } from "@/core/algorithms/DoublyLinkedQueue";

const internalQueue = new DoublyLinkedQueue();

interface PlayerState {
  currentTrack: Track | null;
  nextTrackPreview: Track | null;
  queueItems: Track[];
  isPlaying: boolean;
  volume: number;
  setPlaying: (playing: boolean) => void;
  setVolume: (vol: number) => void;
  playTrackNow: (track: Track) => void;
  enqueueTrack: (track: Track) => void;
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
  volume: 0.85,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),

  // Bấm vào bài hát là thêm vào hàng đợi và phát ngay lập tức
  playTrackNow: (track) => {
    internalQueue.enqueue(track);
    const jumped = internalQueue.jumpTo(track.id);
    set({
      currentTrack: jumped,
      nextTrackPreview: internalQueue.peekNext(),
      queueItems: internalQueue.toArray(),
      isPlaying: true,
    });
  },

  enqueueTrack: (track) => {
    internalQueue.enqueue(track);
    set({
      currentTrack: internalQueue.getCurrent(),
      nextTrackPreview: internalQueue.peekNext(),
      queueItems: internalQueue.toArray(),
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
    });
  },

  advanceNext: () => {
    const next = internalQueue.next();
    set({
      currentTrack: next,
      nextTrackPreview: internalQueue.peekNext(),
      isPlaying: Boolean(next),
    });
    return next;
  },

  advancePrev: () => {
    const prev = internalQueue.prev();
    set({
      currentTrack: prev,
      nextTrackPreview: internalQueue.peekNext(),
      isPlaying: Boolean(prev),
    });
    return prev;
  },
}));