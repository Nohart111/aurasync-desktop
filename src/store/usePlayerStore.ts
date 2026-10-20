import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Track {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  bpm?: number;
  streamUrl?: string;
  cdnUrl?: string;
  coverUrl?: string;
  thumbnail?: string;
  dominantColors?: [string, string];
  [key: string]: any;
}

export interface QueueItem {
  queueId: string;
  track: Track;
}

/**
 * Fisher-Yates shuffle that avoids placing `avoidFirstTrackId` at index 0
 * when there are 2 or more distinct tracks, preventing immediate back-to-back repeat
 * at the playlist boundary while preserving all valid tracks without loss or duplication.
 */
export function shuffleTracksForReplay(tracks: Track[], avoidFirstTrackId?: string | null): Track[] {
  const valid = tracks.filter((t) => Boolean(t && t.id && (t.streamUrl || t.cdnUrl)));
  if (valid.length <= 1) return [...valid];

  const shuffled = [...valid];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

  // Avoid immediately repeating the track that just finished playing
  if (avoidFirstTrackId && shuffled.length > 1 && shuffled[0].id === avoidFirstTrackId) {
    const swapIdx = shuffled.findIndex((t, idx) => idx > 0 && t.id !== avoidFirstTrackId);
    if (swapIdx > 0) {
      const first = shuffled[0];
      shuffled[0] = shuffled[swapIdx];
      shuffled[swapIdx] = first;
    }
  }

  return shuffled;
}

export interface PlayerState {
  currentTrack: Track | null;
  currentQueueId: string | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  currentTime: number; // Alias for progress
  duration: number;
  actualDuration: number; // Alias for duration
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  /** Monotonic counter incremented whenever a track should start/restart from 0:00 */
  playNonce: number;

  // Sidebar & Playlist UI State
  isSidebarCollapsed: boolean;
  playingPlaylistName: string | null;

  // Library & Active Queue (queueItems typed as Track[] for QueueDrawer.tsx compatibility)
  library: Track[];
  queue: Track[];
  queueItems: Track[];
  internalQueue: Track[];

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setPlayingPlaylistName: (name: string | null) => void;

  setCurrentTrack: (track: Track, ...args: any[]) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaying: (playing: boolean) => void; // Alias for useRoomSync.ts and legacy stores
  setVolume: (vol: number) => void;
  setProgress: (prog: number) => void;
  setDuration: (dur: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  setLibrary: (tracks: Track[]) => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track, ...args: any[]) => void;
  enqueueTrack: (track: Track, ...args: any[]) => void; // Alias for DoublyLinkedQueue / useRoomSync
  playNextInQueue: (track: Track, ...args: any[]) => void;
  removeFromQueue: (idOrQueueId: string) => void;
  removeTrackFromQueue: (trackId: string) => void; // Alias
  clearQueue: () => void;

  playNext: () => void;
  playPrevious: () => void;
  advanceNext: (reason?: 'ended' | 'manual' | 'error') => void;
  advancePrev: () => void; // Alias
  jumpToTrack: (trackId: string, ...args: any[]) => void; // Required for useRoomSync.ts and page.tsx
  playFromQueueItem: (id: string) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      currentQueueId: null,
      isPlaying: false,
      volume: 0.8,
      progress: 0,
      currentTime: 0,
      duration: 0,
      actualDuration: 0,
      isShuffle: false,
      repeatMode: 'all',
      playNonce: 0,

      isSidebarCollapsed: false,
      playingPlaylistName: null,

      library: [],
      queue: [],
      queueItems: [],
      internalQueue: [],

      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      setPlayingPlaylistName: (name) => set({ playingPlaylistName: name }),

      setCurrentTrack: (track: Track) =>
        set((state) => {
          if (!track) return state;
          const baseQueue = state.queue.length > 0 ? state.queue : state.library;
          const nextQueue = baseQueue.some((t) => t.id === track.id)
            ? baseQueue
            : [track, ...baseQueue];

          return {
            currentTrack: track,
            currentQueueId: track.id,
            queue: nextQueue,
            queueItems: nextQueue,
            internalQueue: nextQueue,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: state.playNonce + 1,
          };
        }),

      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
      setProgress: (prog) => set({ progress: prog, currentTime: prog }),
      setDuration: (dur) => set({ duration: dur, actualDuration: dur }),

      toggleShuffle: () => set((s) => ({ isShuffle: !s.isShuffle })),
      toggleRepeat: () =>
        set((s) => ({
          repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
        })),

      setLibrary: (tracks) =>
        set((state) => {
          const validTracks = tracks.filter((t) => Boolean(t && t.id));
          let nextQueue: Track[];
          if (state.queue.length === 0) {
            nextQueue = validTracks;
          } else {
            const syncedExisting = state.queue
              .map((qt) => validTracks.find((vt) => vt.id === qt.id))
              .filter((t): t is Track => Boolean(t));
            const newTracks = validTracks.filter(
              (vt) => !syncedExisting.some((st) => st.id === vt.id)
            );
            nextQueue = [...newTracks, ...syncedExisting];
          }

          const stillHasCurrent = state.currentTrack
            ? validTracks.find((t) => t.id === state.currentTrack?.id) || null
            : null;
          const nextCurrent = stillHasCurrent || validTracks[0] || null;

          return {
            library: validTracks,
            queue: nextQueue,
            queueItems: nextQueue,
            internalQueue: nextQueue,
            currentTrack: nextCurrent,
            currentQueueId: nextCurrent ? nextCurrent.id : null,
          };
        }),

      setQueue: (tracks) => {
        const validTracks = tracks.filter((t) => Boolean(t && t.id));
        set((state) => {
          const matched = state.currentTrack
            ? validTracks.find((t) => t.id === state.currentTrack?.id)
            : validTracks[0];
          return {
            queue: validTracks,
            queueItems: validTracks,
            internalQueue: validTracks,
            currentQueueId: matched ? matched.id : null,
          };
        });
      },

      addToQueue: (track: Track) =>
        set((s) => {
          if (!track || !track.id) return s;
          if (s.queue.some((t) => t.id === track.id)) return s;
          const newQueue = [...s.queue, track];
          return {
            queue: newQueue,
            queueItems: newQueue,
            internalQueue: newQueue,
          };
        }),

      enqueueTrack: (track: Track) => {
        get().addToQueue(track);
      },

      playNextInQueue: (track: Track) => {
        if (!track || !track.id) return;
        const { queue, currentTrack } = get();
        const filtered = queue.filter((t) => t.id !== track.id);
        let insertIdx = 0;
        if (currentTrack) {
          const curr = filtered.findIndex((t) => t.id === currentTrack.id);
          insertIdx = curr >= 0 ? curr + 1 : 0;
        }
        filtered.splice(insertIdx, 0, track);

        set({
          queue: filtered,
          queueItems: filtered,
          internalQueue: filtered,
        });
      },

      removeFromQueue: (idOrQueueId: string) =>
        set((s) => {
          const nextQueue = s.queue.filter((t) => t.id !== idOrQueueId);
          const removedCurrent = s.currentTrack && s.currentTrack.id === idOrQueueId;

          if (removedCurrent) {
            const fallbackTrack = nextQueue[0] || s.library.find((t) => t.id !== idOrQueueId) || null;
            return {
              queue: nextQueue,
              queueItems: nextQueue,
              internalQueue: nextQueue,
              currentTrack: fallbackTrack,
              currentQueueId: fallbackTrack ? fallbackTrack.id : null,
              progress: 0,
              currentTime: 0,
              isPlaying: Boolean(fallbackTrack && s.isPlaying),
              playNonce: s.playNonce + 1,
            };
          }

          return {
            queue: nextQueue,
            queueItems: nextQueue,
            internalQueue: nextQueue,
          };
        }),

      removeTrackFromQueue: (trackId: string) => {
        get().removeFromQueue(trackId);
      },

      clearQueue: () =>
        set({
          queue: [],
          queueItems: [],
          internalQueue: [],
          currentQueueId: null,
        }),

      playFromQueueItem: (id: string) => {
        get().jumpToTrack(id);
      },

      jumpToTrack: (trackId: string) => {
        const { queue, library, playNonce } = get();
        const list = queue.length > 0 ? queue : library;
        const target = list.find((t) => t.id === trackId);
        if (target) {
          set({
            currentTrack: target,
            currentQueueId: target.id,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
        }
      },

      advanceNext: (reason = 'ended') => {
        const {
          queue,
          library,
          currentTrack,
          currentQueueId,
          repeatMode,
          playNonce,
        } = get();

        const rawSource = queue.length > 0 ? queue : library;
        const validList = rawSource.filter((t) => Boolean(t && t.id && (t.streamUrl || t.cdnUrl)));

        if (validList.length === 0) {
          set({ isPlaying: false, progress: 0, currentTime: 0 });
          return;
        }

        // Handle single-track repeat mode on natural track end
        if (reason === 'ended' && repeatMode === 'one' && currentTrack) {
          set({
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Single-track playlist: replay from 0:00 without stalling
        if (validList.length === 1) {
          const singleTrack = validList[0];
          set({
            currentTrack: singleTrack,
            currentQueueId: singleTrack.id,
            queue: validList,
            queueItems: validList,
            internalQueue: validList,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Resolve exact current position in queue
        let currIdx = -1;
        if (currentQueueId) {
          currIdx = validList.findIndex((t) => t.id === currentQueueId);
        }
        if (currIdx === -1 && currentTrack) {
          currIdx = validList.findIndex((t) => t.id === currentTrack.id);
        }

        // Case A: Still have unplayed tracks ahead in the current queue -> play next sequentially
        if (currIdx >= 0 && currIdx < validList.length - 1) {
          const nextIdx = currIdx + 1;
          const nextTrack = validList[nextIdx];

          set({
            currentTrack: nextTrack,
            currentQueueId: nextTrack.id,
            queue: validList,
            queueItems: validList,
            internalQueue: validList,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Case B: Current track wasn't in the active queue -> start at index 0 of current queue
        if (currIdx === -1) {
          set({
            currentTrack: validList[0],
            currentQueueId: validList[0].id,
            queue: validList,
            queueItems: validList,
            internalQueue: validList,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Case C: Reached the end of the playlist (currIdx === validList.length - 1)
        // Automatically shuffle the valid playlist and restart playback from index 0 of the shuffled list!
        const shuffledList = shuffleTracksForReplay(validList, currentTrack?.id);
        const firstShuffled = shuffledList[0];

        set({
          queue: shuffledList,
          queueItems: shuffledList,
          internalQueue: shuffledList,
          currentTrack: firstShuffled,
          currentQueueId: firstShuffled.id,
          progress: 0,
          currentTime: 0,
          isPlaying: true,
          playNonce: playNonce + 1,
        });
      },

      advancePrev: () => {
        get().playPrevious();
      },

      playNext: () => {
        get().advanceNext('manual');
      },

      playPrevious: () => {
        const { queue, library, currentTrack, currentQueueId, progress, playNonce } =
          get();
        const rawSource = queue.length > 0 ? queue : library;
        const validList = rawSource.filter((t) => Boolean(t && t.id && (t.streamUrl || t.cdnUrl)));
        if (validList.length === 0) return;

        // If more than 3 seconds into the song, restart current song from 0:00
        if (progress > 3 && currentTrack) {
          set({ progress: 0, currentTime: 0, isPlaying: true, playNonce: playNonce + 1 });
          return;
        }

        let currIdx = -1;
        if (currentQueueId) {
          currIdx = validList.findIndex((t) => t.id === currentQueueId);
        }
        if (currIdx === -1 && currentTrack) {
          currIdx = validList.findIndex((t) => t.id === currentTrack.id);
        }

        const prevIdx = currIdx > 0 ? currIdx - 1 : validList.length - 1;

        set({
          currentTrack: validList[prevIdx],
          currentQueueId: validList[prevIdx].id,
          queue: validList,
          queueItems: validList,
          internalQueue: validList,
          progress: 0,
          currentTime: 0,
          isPlaying: true,
          playNonce: playNonce + 1,
        });
      },
    }),
    {
      name: 'aurasound-player-storage',
      partialize: (state) => ({
        volume: state.volume,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        isSidebarCollapsed: state.isSidebarCollapsed,
      }),
    }
  )
);
