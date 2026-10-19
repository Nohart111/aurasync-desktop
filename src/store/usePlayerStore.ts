import { create } from 'zustand';

export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  streamUrl?: string;
  url?: string;
  coverUrl?: string;
}

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueItems: Track[];
  isPlaying: boolean;
  volume: number;
  isSidebarCollapsed: boolean;

  setIsPlaying: (isPlaying: boolean) => void;
  setPlaying: (isPlaying: boolean) => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  toggleSidebar: () => void;
  playTrackNow: (track: Track, newQueue?: Track[]) => void;
  enqueueTrack: (track: Track) => void;
  removeTrackFromQueue: (trackId: string) => void;
  jumpToTrack: (trackId: string) => void;
  advanceNext: () => Track | null;
  advancePrev: () => Track | null;
  setQueue: (tracks: Track[]) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueItems: [],
  isPlaying: false,
  volume: 0.85,
  isSidebarCollapsed: false,

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setVolume: (volume) => set({ volume }),

  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  playTrackNow: (track, newQueue) => {
    const { queue } = get();
    let finalQueue = queue;
    if (newQueue && newQueue.length > 0) {
      finalQueue = newQueue;
    } else if (!queue.some((t) => String(t.id) === String(track.id))) {
      finalQueue = [...queue, track];
    }
    set({
      currentTrack: track,
      queue: finalQueue,
      queueItems: finalQueue,
      isPlaying: true,
    });
  },

  enqueueTrack: (track) => {
    set((state) => {
      const exists = state.queue.some((t) => String(t.id) === String(track.id));
      if (exists) return state;
      const updated = [...state.queue, track];
      return {
        queue: updated,
        queueItems: updated,
        currentTrack: state.currentTrack || track,
      };
    });
  },

  removeTrackFromQueue: (trackId) => {
    set((state) => {
      const updated = state.queue.filter((t) => String(t.id) !== String(trackId));
      const isCurrent = state.currentTrack && String(state.currentTrack.id) === String(trackId);
      return {
        queue: updated,
        queueItems: updated,
        currentTrack: isCurrent ? (updated[0] || null) : state.currentTrack,
        isPlaying: isCurrent && updated.length === 0 ? false : state.isPlaying,
      };
    });
  },

  jumpToTrack: (trackId) => {
    const { queue } = get();
    const track = queue.find((t) => String(t.id) === String(trackId));
    if (track) {
      set({ currentTrack: track, isPlaying: true });
    }
  },

  advanceNext: () => {
    const { queue, currentTrack } = get();
    if (!queue || queue.length === 0) return null;

    // Nếu chỉ có 1 bài trong danh sách
    if (queue.length === 1) {
      set({ currentTrack: queue[0], isPlaying: true });
      return queue[0];
    }

    // Tìm index bài hiện tại (so khớp cả ID lẫn tên bài hát)
    const currentIndex = queue.findIndex(
      (t) => String(t.id) === String(currentTrack?.id) || t.title === currentTrack?.title
    );
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % queue.length;
    const nextTrack = queue[nextIndex];

    set({
      currentTrack: nextTrack,
      isPlaying: true,
    });
    return nextTrack;
  },

  advancePrev: () => {
    const { queue, currentTrack } = get();
    if (!queue || queue.length === 0) return null;

    if (queue.length === 1) {
      set({ currentTrack: queue[0], isPlaying: true });
      return queue[0];
    }

    const currentIndex = queue.findIndex(
      (t) => String(t.id) === String(currentTrack?.id) || t.title === currentTrack?.title
    );
    const prevIndex = currentIndex === -1 ? 0 : (currentIndex - 1 + queue.length) % queue.length;
    const prevTrack = queue[prevIndex];

    set({
      currentTrack: prevTrack,
      isPlaying: true,
    });
    return prevTrack;
  },

  setQueue: (tracks) => set({ queue: tracks, queueItems: tracks }),
}));

// Tự động nạp toàn bộ bài hát từ CDN/Catalog vào queue khi mở trang
if (typeof window !== 'undefined') {
  fetch('/api/tracks/search')
    .then((res) => res.json())
    .then((data) => {
      const tracks = Array.isArray(data) ? data : (data.tracks || []);
      if (Array.isArray(tracks) && tracks.length > 0) {
        const store = usePlayerStore.getState();
        if (!store.queue || store.queue.length === 0) {
          store.setQueue(tracks);
          if (!store.currentTrack) {
            usePlayerStore.setState({ currentTrack: tracks[0] });
          }
        }
      }
    })
    .catch(() => {});
}
