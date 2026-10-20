export type { Track } from '@/core/algorithms/DoublyLinkedQueue';
﻿import { create } from 'zustand';
import { DoublyLinkedQueue, Track } from '@/core/algorithms/DoublyLinkedQueue';

const internalQueue = new DoublyLinkedQueue();

function syncInternalQueue(tracks: Track[], currentId?: string | null) {
  try {
    const existing = internalQueue.toArray();
    for (const t of existing) {
      internalQueue.removeById(t.id);
    }
    for (const t of tracks) {
      internalQueue.enqueue(t);
    }
    if (currentId) {
      internalQueue.jumpTo(currentId);
    }
  } catch {}
}

export interface PlayerState {
  currentTrack: Track | null;
  nextTrackPreview: Track | null;
  queue: Track[];
  queueItems: Track[];
  playingPlaylistName: string;
  isPlaying: boolean;
  volume: number;
  isSidebarCollapsed: boolean;
  setPlaying: (playing: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setVolume: (vol: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setPlayingPlaylistName: (name: string) => void;
  setQueue: (tracks: Track[], playlistName?: string) => void;
  playTrackNow: (track: Track, contextTracks?: Track[], playlistName?: string) => void;
  enqueueTrack: (track: Track) => void;
  playNextInQueue: (track: Track) => void;
  removeTrackFromQueue: (trackId: string) => void;
  jumpToTrack: (trackId: string) => void;
  advanceNext: () => Track | null;
  advancePrev: () => Track | null;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  nextTrackPreview: null,
  queue: [],
  queueItems: [],
  playingPlaylistName: 'Thư viện chung',
  isPlaying: false,
  volume: 0.85,
  isSidebarCollapsed: false,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setVolume: (volume) => set({ volume }),

  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
  setPlayingPlaylistName: (playingPlaylistName) => set({ playingPlaylistName }),

  setQueue: (tracks, playlistName) => {
    const state = get();
    const cleanTracks = Array.isArray(tracks) ? tracks : [];
    syncInternalQueue(cleanTracks, state.currentTrack?.id);

    const currIdx = state.currentTrack
      ? cleanTracks.findIndex((t) => t.id === state.currentTrack?.id)
      : -1;
    const nextPreview =
      currIdx >= 0 && cleanTracks.length > 1
        ? cleanTracks[(currIdx + 1) % cleanTracks.length]
        : cleanTracks[0] || null;

    set({
      queue: cleanTracks,
      queueItems: cleanTracks,
      nextTrackPreview: nextPreview,
      ...(playlistName ? { playingPlaylistName: playlistName } : {}),
    });
  },

  playTrackNow: (track, contextTracks, playlistName) => {
    const state = get();
    let list = Array.isArray(contextTracks) && contextTracks.length > 0 ? [...contextTracks] : [...state.queue];
    if (!list.some((t) => t.id === track.id)) {
      list = [track, ...list];
    }

    syncInternalQueue(list, track.id);
    const idx = list.findIndex((t) => t.id === track.id);
    const nextPreview = list.length > 1 ? list[(idx + 1) % list.length] : null;

    set({
      currentTrack: track,
      nextTrackPreview: nextPreview,
      queue: list,
      queueItems: list,
      isPlaying: true,
      ...(playlistName ? { playingPlaylistName: playlistName } : {}),
    });
  },

  enqueueTrack: (track) => {
    const state = get();
    if (state.queue.some((t) => t.id === track.id)) return;
    const updated = [...state.queue, track];
    syncInternalQueue(updated, state.currentTrack?.id || track.id);

    const curr = state.currentTrack || track;
    const idx = updated.findIndex((t) => t.id === curr.id);
    const nextPreview = updated.length > 1 ? updated[(idx + 1) % updated.length] : null;

    set({
      currentTrack: curr,
      nextTrackPreview: nextPreview,
      queue: updated,
      queueItems: updated,
    });
  },

  playNextInQueue: (track) => {
    const state = get();
    const filtered = state.queue.filter((t) => t.id !== track.id);
    const currIdx = state.currentTrack
      ? filtered.findIndex((t) => t.id === state.currentTrack?.id)
      : -1;

    const updated = [...filtered];
    if (currIdx >= 0) {
      updated.splice(currIdx + 1, 0, track);
    } else {
      updated.push(track);
    }

    syncInternalQueue(updated, state.currentTrack?.id);
    set({
      nextTrackPreview: track,
      queue: updated,
      queueItems: updated,
    });
  },

  removeTrackFromQueue: (trackId) => {
    const state = get();
    const updated = state.queue.filter((t) => t.id !== trackId);
    let nextCurr = state.currentTrack;
    if (state.currentTrack?.id === trackId) {
      nextCurr = updated[0] || null;
    }
    syncInternalQueue(updated, nextCurr?.id);

    const idx = nextCurr ? updated.findIndex((t) => t.id === nextCurr?.id) : -1;
    const nextPreview = idx >= 0 && updated.length > 1 ? updated[(idx + 1) % updated.length] : null;

    set({
      currentTrack: nextCurr,
      nextTrackPreview: nextPreview,
      queue: updated,
      queueItems: updated,
      isPlaying: nextCurr ? state.isPlaying : false,
    });
  },

  jumpToTrack: (trackId) => {
    const state = get();
    const idx = state.queue.findIndex((t) => t.id === trackId);
    if (idx === -1) return;

    const target = state.queue[idx];
    const nextPreview = state.queue.length > 1 ? state.queue[(idx + 1) % state.queue.length] : null;
    syncInternalQueue(state.queue, target.id);

    set({
      currentTrack: target,
      nextTrackPreview: nextPreview,
      isPlaying: true,
    });
  },

  advanceNext: () => {
    const state = get();
    const list = state.queue;
    if (!list || list.length === 0) return null;

    const currIdx = state.currentTrack
      ? list.findIndex((t) => t.id === state.currentTrack?.id)
      : -1;
    const nextIdx = currIdx >= 0 ? (currIdx + 1) % list.length : 0;
    const nextTrack = list[nextIdx];
    const afterNext = list.length > 1 ? list[(nextIdx + 1) % list.length] : null;

    syncInternalQueue(list, nextTrack.id);

    set({
      currentTrack: nextTrack,
      nextTrackPreview: afterNext,
      isPlaying: true,
    });
    return nextTrack;
  },

  advancePrev: () => {
    const state = get();
    const list = state.queue;
    if (!list || list.length === 0) return null;

    const currIdx = state.currentTrack
      ? list.findIndex((t) => t.id === state.currentTrack?.id)
      : -1;
    const prevIdx = currIdx > 0 ? currIdx - 1 : list.length - 1;
    const prevTrack = list[prevIdx];
    const nextPreview = list.length > 1 ? list[(prevIdx + 1) % list.length] : null;

    syncInternalQueue(list, prevTrack.id);

    set({
      currentTrack: prevTrack,
      nextTrackPreview: nextPreview,
      isPlaying: true,
    });
    return prevTrack;
  },
}));
