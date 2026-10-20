import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type { Track };
export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  bpm?: number;
  streamUrl: string;
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
  const valid = tracks.filter((t) => Boolean(t && t.id && t.streamUrl));
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

function makeQueueItems(tracks: Track[], prefix = 'q'): QueueItem[] {
  const now = Date.now();
  return tracks.map((track, idx) => ({
    queueId: `${prefix}-${now}-${idx}-${track.id}`,
    track,
  }));
}

export interface PlayerState {
  currentTrack: Track | null;
  currentQueueId: string | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  /** Monotonic counter incremented whenever a track should start/restart from 0:00 */
  playNonce: number;

  // Library & Active Queue
  library: Track[];
  queue: Track[];
  queueItems: QueueItem[];
  internalQueue: QueueItem[];

  // Actions
  setCurrentTrack: (track: Track) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaying: (playing: boolean) => void; // Alias for useRoomSync.ts and legacy stores
  setVolume: (vol: number) => void;
  setProgress: (prog: number) => void;
  setDuration: (dur: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  setLibrary: (tracks: Track[]) => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
  enqueueTrack: (track: Track) => void; // Alias for DoublyLinkedQueue / useRoomSync
  playNextInQueue: (track: Track) => void;
  removeFromQueue: (idOrQueueId: string) => void;
  removeTrackFromQueue: (trackId: string) => void; // Alias
  clearQueue: () => void;

  playNext: () => void;
  playPrevious: () => void;
  advanceNext: (reason?: 'ended' | 'manual' | 'error') => void;
  advancePrev: () => void; // Alias
  jumpToTrack: (trackId: string) => void; // Required for useRoomSync.ts
  playFromQueueItem: (queueId: string) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      currentQueueId: null,
      isPlaying: false,
      volume: 0.8,
      progress: 0,
      duration: 0,
      isShuffle: false,
      repeatMode: 'all',
      playNonce: 0,

      library: [],
      queue: [],
      queueItems: [],
      internalQueue: [],

      setCurrentTrack: (track) =>
        set((state) => {
          const baseQueue = state.queue.length > 0 ? state.queue : state.library;
          const nextQueue = baseQueue.some((t) => t.id === track.id)
            ? baseQueue
            : [track, ...baseQueue];
          const existingItem = state.queueItems.find((item) => item.track.id === track.id);
          const nextItems =
            state.queueItems.length > 0 && existingItem
              ? state.queueItems
              : makeQueueItems(nextQueue, 'sync');
          const matchedItem =
            nextItems.find((item) => item.track.id === track.id) || null;

          return {
            currentTrack: track,
            currentQueueId: matchedItem ? matchedItem.queueId : null,
            queue: nextQueue,
            queueItems: nextItems,
            internalQueue: nextItems,
            progress: 0,
            isPlaying: true,
            playNonce: state.playNonce + 1,
          };
        }),

      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setPlaying: (playing) => set({ isPlaying: playing }),
      setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),
      setProgress: (prog) => set({ progress: prog }),
      setDuration: (dur) => set({ duration: dur }),

      toggleShuffle: () => set((s) => ({ isShuffle: !s.isShuffle })),
      toggleRepeat: () =>
        set((s) => ({
          repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
        })),

      setLibrary: (tracks) =>
        set((state) => {
          const validTracks = tracks.filter((t) => Boolean(t && t.id && t.streamUrl));
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

          const items = makeQueueItems(nextQueue, 'lib');
          const stillHasCurrent = state.currentTrack
            ? validTracks.find((t) => t.id === state.currentTrack?.id) || null
            : null;
          const nextCurrent = stillHasCurrent || validTracks[0] || null;
          const nextQueueId = nextCurrent
            ? items.find((i) => i.track.id === nextCurrent.id)?.queueId || null
            : null;

          return {
            library: validTracks,
            queue: nextQueue,
            queueItems: items,
            internalQueue: items,
            currentTrack: nextCurrent,
            currentQueueId: nextQueueId,
          };
        }),

      setQueue: (tracks) => {
        const validTracks = tracks.filter((t) => Boolean(t && t.id && t.streamUrl));
        const items = makeQueueItems(validTracks, 'set');
        set((state) => {
          const matchedItem = state.currentTrack
            ? items.find((i) => i.track.id === state.currentTrack?.id)
            : items[0];
          return {
            queue: validTracks,
            queueItems: items,
            internalQueue: items,
            currentQueueId: matchedItem ? matchedItem.queueId : null,
          };
        });
      },

      addToQueue: (track) =>
        set((s) => {
          if (!track || !track.id || !track.streamUrl) return s;
          if (s.queue.some((t) => t.id === track.id)) return s;
          const newQueue = [...s.queue, track];
          const newItem: QueueItem = {
            queueId: `q-${Date.now()}-${newQueue.length}-${track.id}`,
            track,
          };
          const nextItems = [...s.queueItems, newItem];
          return {
            queue: newQueue,
            queueItems: nextItems,
            internalQueue: nextItems,
          };
        }),

      enqueueTrack: (track) => {
        get().addToQueue(track);
      },

      playNextInQueue: (track) => {
        if (!track || !track.id) return;
        const { queue, queueItems, currentTrack, currentQueueId, playNonce } = get();
        const filtered = queue.filter((t) => t.id !== track.id);
        let insertIdx = 0;
        if (currentTrack) {
          const curr = filtered.findIndex((t) => t.id === currentTrack.id);
          insertIdx = curr >= 0 ? curr + 1 : 0;
        }
        filtered.splice(insertIdx, 0, track);
        const nextItems = makeQueueItems(filtered, 'next');
        const matchedItem = currentTrack
          ? nextItems.find((i) => i.track.id === currentTrack.id) || null
          : null;

        set({
          queue: filtered,
          queueItems: nextItems,
          internalQueue: nextItems,
          currentQueueId: matchedItem ? matchedItem.queueId : currentQueueId,
        });
      },

      removeFromQueue: (idOrQueueId) =>
        set((s) => {
          const nextItems = s.queueItems.filter(
            (i) => i.queueId !== idOrQueueId && i.track.id !== idOrQueueId
          );
          const nextQueue =
            nextItems.length > 0
              ? nextItems.map((i) => i.track)
              : s.queue.filter((t) => t.id !== idOrQueueId);

          const removedCurrent =
            s.currentTrack &&
            (s.currentTrack.id === idOrQueueId || s.currentQueueId === idOrQueueId);

          if (removedCurrent) {
            const fallbackTrack = nextQueue[0] || s.library.find((t) => t.id !== idOrQueueId) || null;
            const fallbackItem = fallbackTrack
              ? nextItems.find((i) => i.track.id === fallbackTrack.id) || null
              : null;
            return {
              queue: nextQueue,
              queueItems: nextItems,
              internalQueue: nextItems,
              currentTrack: fallbackTrack,
              currentQueueId: fallbackItem ? fallbackItem.queueId : null,
              progress: 0,
              isPlaying: Boolean(fallbackTrack && s.isPlaying),
              playNonce: s.playNonce + 1,
            };
          }

          return {
            queue: nextQueue,
            queueItems: nextItems,
            internalQueue: nextItems,
          };
        }),

      removeTrackFromQueue: (trackId) => {
        get().removeFromQueue(trackId);
      },

      clearQueue: () =>
        set({
          queue: [],
          queueItems: [],
          internalQueue: [],
          currentQueueId: null,
        }),

      playFromQueueItem: (queueId) => {
        const { queueItems, internalQueue, playNonce } = get();
        const items = queueItems.length > 0 ? queueItems : internalQueue;
        const found = items.find((i) => i.queueId === queueId);
        if (found) {
          set({
            currentTrack: found.track,
            currentQueueId: found.queueId,
            progress: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
        }
      },

      jumpToTrack: (trackId: string) => {
        const { queue, library, queueItems, playNonce } = get();
        const list = queue.length > 0 ? queue : library;
        const target = list.find((t) => t.id === trackId);
        if (target) {
          const matchedItem = queueItems.find((i) => i.track.id === target.id) || null;
          set({
            currentTrack: target,
            currentQueueId: matchedItem ? matchedItem.queueId : null,
            progress: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
        }
      },

      advanceNext: (reason = 'ended') => {
        const {
          queue,
          library,
          queueItems,
          currentTrack,
          currentQueueId,
          repeatMode,
          playNonce,
        } = get();

        const rawSource = queue.length > 0 ? queue : library;
        const validList = rawSource.filter((t) => Boolean(t && t.id && t.streamUrl));

        if (validList.length === 0) {
          set({ isPlaying: false, progress: 0 });
          return;
        }

        // Handle single-track repeat mode on natural track end
        if (reason === 'ended' && repeatMode === 'one' && currentTrack) {
          set({
            progress: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Single-track playlist: replay from 0:00 without stalling
        if (validList.length === 1) {
          const singleTrack = validList[0];
          const singleItems =
            queueItems.length === 1 && queueItems[0].track.id === singleTrack.id
              ? queueItems
              : makeQueueItems(validList, 'single');
          set({
            currentTrack: singleTrack,
            currentQueueId: singleItems[0].queueId,
            queue: validList,
            queueItems: singleItems,
            internalQueue: singleItems,
            progress: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Resolve exact current position in queue
        let currIdx = -1;
        if (currentQueueId && queueItems.length === validList.length) {
          currIdx = queueItems.findIndex((item) => item.queueId === currentQueueId);
        }
        if (currIdx === -1 && currentTrack) {
          currIdx = validList.findIndex((t) => t.id === currentTrack.id);
        }

        // Case A: Still have unplayed tracks ahead in the current queue -> play next sequentially
        if (currIdx >= 0 && currIdx < validList.length - 1) {
          const nextIdx = currIdx + 1;
          const nextTrack = validList[nextIdx];
          const ensuredItems =
            queueItems.length === validList.length
              ? queueItems
              : makeQueueItems(validList, 'seq');
          const nextQueueId = ensuredItems[nextIdx]?.queueId || null;

          set({
            currentTrack: nextTrack,
            currentQueueId: nextQueueId,
            queue: validList,
            queueItems: ensuredItems,
            internalQueue: ensuredItems,
            progress: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Case B: Current track wasn't in the active queue -> start at index 0 of current queue
        if (currIdx === -1) {
          const ensuredItems =
            queueItems.length === validList.length
              ? queueItems
              : makeQueueItems(validList, 'init');
          set({
            currentTrack: validList[0],
            currentQueueId: ensuredItems[0]?.queueId || null,
            queue: validList,
            queueItems: ensuredItems,
            internalQueue: ensuredItems,
            progress: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        // Case C: Reached the end of the playlist (currIdx === validList.length - 1)
        // Automatically shuffle the valid playlist and restart playback from index 0 of the shuffled list!
        const shuffledList = shuffleTracksForReplay(validList, currentTrack?.id);
        const shuffledItems = makeQueueItems(shuffledList, 'shuffled');
        const firstShuffled = shuffledList[0];

        set({
          queue: shuffledList,
          queueItems: shuffledItems,
          internalQueue: shuffledItems,
          currentTrack: firstShuffled,
          currentQueueId: shuffledItems[0]?.queueId || null,
          progress: 0,
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
        const { queue, library, queueItems, currentTrack, currentQueueId, progress, playNonce } =
          get();
        const rawSource = queue.length > 0 ? queue : library;
        const validList = rawSource.filter((t) => Boolean(t && t.id && t.streamUrl));
        if (validList.length === 0) return;

        // If more than 3 seconds into the song, restart current song from 0:00
        if (progress > 3 && currentTrack) {
          set({ progress: 0, isPlaying: true, playNonce: playNonce + 1 });
          return;
        }

        let currIdx = -1;
        if (currentQueueId && queueItems.length === validList.length) {
          currIdx = queueItems.findIndex((item) => item.queueId === currentQueueId);
        }
        if (currIdx === -1 && currentTrack) {
          currIdx = validList.findIndex((t) => t.id === currentTrack.id);
        }

        const prevIdx = currIdx > 0 ? currIdx - 1 : validList.length - 1;
        const ensuredItems =
          queueItems.length === validList.length
            ? queueItems
            : makeQueueItems(validList, 'prev');

        set({
          currentTrack: validList[prevIdx],
          currentQueueId: ensuredItems[prevIdx]?.queueId || null,
          queue: validList,
          queueItems: ensuredItems,
          internalQueue: ensuredItems,
          progress: 0,
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
      }),
    }
  )
);
