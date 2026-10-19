import { create } from "zustand";
import { DoublyLinkedQueue, Track } from "@/core/algorithms/DoublyLinkedQueue";

const internalQueue = new DoublyLinkedQueue();

interface PlayerState {
  currentTrack: Track | null;
  nextTrackPreview: Track | null;
  queueItems: Track[];
  isPlaying: boolean;
  volume: number;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (vol: number) => void;
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
  isSidebarCollapsed: false,

  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),

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
