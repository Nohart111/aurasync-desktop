import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  bpm?: number;
  streamUrl?: string;
  cdnUrl?: string;
  coverUrl?: string;
  thumbnail?: string;
  dominantColors?: [string, string];
  isPreview?: boolean;
  [key: string]: any;
}

export interface QueueItem {
  queueId: string;
  track: Track;
}

let lastEnqueueTick = 0;
let batchEnqueueIds: string[] = [];

function isVaultTrack(t?: Track | null): boolean {
  if (!t || !t.id || t.isPreview) return false;
  const raw = String(t.streamUrl || t.cdnUrl || '');
  if (!raw || raw.startsWith('yt-preview:')) return false;
  return true;
}

export function shuffleTracksForReplay(tracks: Track[], avoidFirstTrackId?: string | null): Track[] {
  const valid = tracks.filter((t) => isVaultTrack(t));
  if (valid.length <= 1) return [...valid];

  const shuffled = [...valid];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }

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

function computeNextPreview(queue: Track[], currentTrack: Track | null): Track | null {
  if (!queue || queue.length === 0) return null;
  if (!currentTrack || currentTrack.isPreview) return queue[0] || null;
  const idx = queue.findIndex((t) => t.id === currentTrack.id);
  if (idx >= 0 && idx < queue.length - 1) {
    return queue[idx + 1];
  }
  return queue[0] || null;
}

export interface PlayerState {
  currentTrack: Track | null;
  nextTrackPreview: Track | null;
  currentQueueId: string | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  currentTime: number;
  duration: number;
  actualDuration: number;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';
  playNonce: number;

  isSidebarCollapsed: boolean;
  playingPlaylistName: string | null;

  library: Track[];
  queue: Track[];
  queueItems: Track[];
  internalQueue: Track[];

  toggleSidebar: (...args: any[]) => void;
  setSidebarCollapsed: (collapsed?: any, ...args: any[]) => void;
  setPlayingPlaylistName: (name?: any, ...args: any[]) => void;

  setCurrentTrack: (track?: any, ...args: any[]) => void;
  playTrackNow: (track?: any, ...args: any[]) => void;
  togglePlay: (...args: any[]) => void;
  setIsPlaying: (playing?: any, ...args: any[]) => void;
  setPlaying: (playing?: any, ...args: any[]) => void;
  setVolume: (vol?: any, ...args: any[]) => void;
  setProgress: (prog?: any, ...args: any[]) => void;
  setDuration: (dur?: any, ...args: any[]) => void;
  toggleShuffle: (...args: any[]) => void;
  toggleRepeat: (...args: any[]) => void;

  setLibrary: (tracks?: any, ...args: any[]) => void;
  setQueue: (tracks?: any, ...args: any[]) => void;
  addToQueue: (track?: any, ...args: any[]) => void;
  enqueueTrack: (track?: any, ...args: any[]) => void;
  playNextInQueue: (track?: any, ...args: any[]) => void;
  removeFromQueue: (idOrQueueId?: any, ...args: any[]) => void;
  removeTrackFromQueue: (trackId?: any, ...args: any[]) => void;
  clearQueue: (...args: any[]) => void;

  playNext: (...args: any[]) => void;
  playPrevious: (...args: any[]) => void;
  advanceNext: (reason?: any, ...args: any[]) => void;
  advancePrev: (...args: any[]) => void;
  jumpToTrack: (trackIdOrTrack?: any, ...args: any[]) => void;
  playFromQueueItem: (id?: any, ...args: any[]) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      nextTrackPreview: null,
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

      toggleSidebar: (..._args: any[]) => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed?: any, ..._args: any[]) =>
        set({ isSidebarCollapsed: Boolean(collapsed) }),
      setPlayingPlaylistName: (name?: any, ..._args: any[]) =>
        set({ playingPlaylistName: typeof name === 'string' ? name : null }),

      setCurrentTrack: (track?: any, ...args: any[]) =>
        set((state) => {
          if (!track || !track.id) return state;

          // Nếu là bài nghe thử tạm thời từ mục Khám phá (isPreview === true),
          // chỉ gán lên currentTrack mà không chèn vào danh sách phát cố định (queue)
          if (track.isPreview) {
            return {
              currentTrack: track,
              progress: 0,
              currentTime: 0,
              duration: track.duration || 240,
              actualDuration: track.duration || 240,
              isPlaying: true,
              playNonce: state.playNonce + 1,
            };
          }

          const optionalQueue = Array.isArray(args[0]) ? args[0] : null;
          const optionalPlaylistName =
            typeof args[0] === 'string'
              ? args[0]
              : typeof args[1] === 'string'
              ? args[1]
              : state.playingPlaylistName;

          const baseQueue =
            optionalQueue && optionalQueue.length > 0
              ? optionalQueue
              : state.queue.length > 0
              ? state.queue
              : state.library;

          const nextQueue = baseQueue.some((t: Track) => t.id === track.id)
            ? baseQueue
            : [track, ...baseQueue];

          return {
            currentTrack: track,
            nextTrackPreview: computeNextPreview(nextQueue, track),
            currentQueueId: track.id,
            queue: nextQueue,
            queueItems: nextQueue,
            internalQueue: nextQueue,
            playingPlaylistName: optionalPlaylistName,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: state.playNonce + 1,
          };
        }),

      playTrackNow: (track?: any, ...args: any[]) => {
        if (!track) return;
        if (typeof track === 'string') {
          get().jumpToTrack(track, ...args);
          return;
        }
        get().setCurrentTrack(track, ...args);
      },

      togglePlay: (..._args: any[]) => {
        const state = get();
        if (!state.currentTrack) {
          const first = state.queue[0] || state.library[0];
          if (first) {
            state.setCurrentTrack(first);
            return;
          }
        }
        set({ isPlaying: !state.isPlaying });
      },

      setIsPlaying: (playing?: any, ..._args: any[]) => set({ isPlaying: Boolean(playing) }),
      setPlaying: (playing?: any, ..._args: any[]) => set({ isPlaying: Boolean(playing) }),
      setVolume: (vol?: any, ..._args: any[]) =>
        set({ volume: Math.max(0, Math.min(1, typeof vol === 'number' ? vol : 0.8)) }),
      setProgress: (prog?: any, ..._args: any[]) => {
        const val = typeof prog === 'number' ? prog : 0;
        set({ progress: val, currentTime: val });
      },
      setDuration: (dur?: any, ..._args: any[]) => {
        const val = typeof dur === 'number' ? dur : 0;
        set({ duration: val, actualDuration: val });
      },

      toggleShuffle: (..._args: any[]) => set((s) => ({ isShuffle: !s.isShuffle })),
      toggleRepeat: (..._args: any[]) =>
        set((s) => ({
          repeatMode: s.repeatMode === 'off' ? 'all' : s.repeatMode === 'all' ? 'one' : 'off',
        })),

      setLibrary: (tracks?: any, ..._args: any[]) =>
        set((state) => {
          const raw = Array.isArray(tracks) ? tracks : [];
          const validTracks: Track[] = raw.filter((t) => Boolean(t && t.id && t.title && !t.isPreview));
          let nextQueue: Track[];
          if (state.queue.length <= 1) {
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

          // Nếu đang phát bài nghe thử (isPreview), giữ nguyên currentTrack nghe thử mà không làm gián đoạn
          const matchedCurrent = state.currentTrack?.isPreview
            ? state.currentTrack
            : state.currentTrack
            ? validTracks.find((t) => t.id === state.currentTrack?.id) || state.currentTrack
            : validTracks[0] || null;

          let finalLibrary = validTracks;
          if (
            matchedCurrent &&
            !matchedCurrent.isPreview &&
            !finalLibrary.some((t) => t.id === matchedCurrent.id)
          ) {
            finalLibrary = [matchedCurrent, ...finalLibrary];
          }
          if (
            matchedCurrent &&
            !matchedCurrent.isPreview &&
            !nextQueue.some((t) => t.id === matchedCurrent.id)
          ) {
            nextQueue = [matchedCurrent, ...nextQueue];
          }

          return {
            library: finalLibrary,
            queue: nextQueue,
            queueItems: nextQueue,
            internalQueue: nextQueue,
            currentTrack: matchedCurrent,
            nextTrackPreview: computeNextPreview(nextQueue, matchedCurrent),
            currentQueueId: matchedCurrent && !matchedCurrent.isPreview ? matchedCurrent.id : state.currentQueueId,
          };
        }),

      setQueue: (tracks?: any, ..._args: any[]) => {
        const raw = Array.isArray(tracks) ? tracks : [];
        const validTracks: Track[] = raw.filter((t) => Boolean(t && t.id && t.title && !t.isPreview));
        set((state) => {
          const matched = state.currentTrack
            ? validTracks.find((t) => t.id === state.currentTrack?.id)
            : validTracks[0];
          return {
            queue: validTracks,
            queueItems: validTracks,
            internalQueue: validTracks,
            nextTrackPreview: computeNextPreview(validTracks, matched || null),
            currentQueueId: matched ? matched.id : state.currentQueueId,
          };
        });
      },

      addToQueue: (track?: any, ...args: any[]) =>
        set((s) => {
          if (!track || !track.id || track.isPreview) return s;
          const now = Date.now();
          const isSameBatch = now - lastEnqueueTick < 25;
          lastEnqueueTick = now;

          if (!isSameBatch) {
            batchEnqueueIds = [track.id];
          } else if (!batchEnqueueIds.includes(track.id)) {
            batchEnqueueIds.push(track.id);
          }

          if (Array.isArray(args[0]) && args[0].length > 0) {
            const fullList = args[0].filter((t: any) => Boolean(t && t.id && !t.isPreview));
            return {
              queue: fullList,
              queueItems: fullList,
              internalQueue: fullList,
              nextTrackPreview: computeNextPreview(fullList, s.currentTrack),
            };
          }

          const basePool = s.queue.length > 1 ? s.queue : s.library.length > 0 ? s.library : s.queue;
          const poolWithTrack = basePool.some((t) => t.id === track.id)
            ? basePool.map((t) => (t.id === track.id ? track : t))
            : [...basePool, track];

          if (isSameBatch && batchEnqueueIds.length > 1) {
            const orderedBatch = batchEnqueueIds
              .map((id) => poolWithTrack.find((t) => t.id === id))
              .filter((t): t is Track => Boolean(t));
            const remaining = poolWithTrack.filter((t) => !batchEnqueueIds.includes(t.id));
            const nextQueue = [...orderedBatch, ...remaining];
            return {
              queue: nextQueue,
              queueItems: nextQueue,
              internalQueue: nextQueue,
              nextTrackPreview: computeNextPreview(nextQueue, s.currentTrack),
            };
          }

          return {
            queue: poolWithTrack,
            queueItems: poolWithTrack,
            internalQueue: poolWithTrack,
            nextTrackPreview: computeNextPreview(poolWithTrack, s.currentTrack),
          };
        }),

      enqueueTrack: (track?: any, ...args: any[]) => {
        get().addToQueue(track, ...args);
      },

      playNextInQueue: (track?: any, ..._args: any[]) => {
        if (!track || !track.id || track.isPreview) return;
        const { queue, currentTrack } = get();
        const filtered = queue.filter((t) => t.id !== track.id);
        let insertIdx = 0;
        if (currentTrack && !currentTrack.isPreview) {
          const curr = filtered.findIndex((t) => t.id === currentTrack.id);
          insertIdx = curr >= 0 ? curr + 1 : 0;
        }
        filtered.splice(insertIdx, 0, track);

        set({
          queue: filtered,
          queueItems: filtered,
          internalQueue: filtered,
          nextTrackPreview: computeNextPreview(filtered, currentTrack),
        });
      },

      removeFromQueue: (idOrQueueId?: any, ..._args: any[]) =>
        set((s) => {
          if (!idOrQueueId) return s;
          const nextQueue = s.queue.filter((t) => t.id !== idOrQueueId);
          const removedCurrent = s.currentTrack && s.currentTrack.id === idOrQueueId;

          if (removedCurrent) {
            const fallbackTrack = nextQueue[0] || s.library.find((t) => t.id !== idOrQueueId) || null;
            return {
              queue: nextQueue,
              queueItems: nextQueue,
              internalQueue: nextQueue,
              currentTrack: fallbackTrack,
              nextTrackPreview: computeNextPreview(nextQueue, fallbackTrack),
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
            nextTrackPreview: computeNextPreview(nextQueue, s.currentTrack),
          };
        }),

      removeTrackFromQueue: (trackId?: any, ..._args: any[]) => {
        get().removeFromQueue(trackId);
      },

      clearQueue: (..._args: any[]) =>
        set({
          queue: [],
          queueItems: [],
          internalQueue: [],
          nextTrackPreview: null,
          currentQueueId: null,
        }),

      playFromQueueItem: (id?: any, ...args: any[]) => {
        get().jumpToTrack(id, ...args);
      },

      jumpToTrack: (trackIdOrTrack?: any, ...args: any[]) => {
        if (!trackIdOrTrack) return;
        const { queue, library, playNonce, playingPlaylistName } = get();

        const extraQueue = Array.isArray(args[0]) ? args[0] : null;
        const extraName =
          typeof args[0] === 'string'
            ? args[0]
            : typeof args[1] === 'string'
            ? args[1]
            : playingPlaylistName;

        let activeList =
          extraQueue && extraQueue.length > 0
            ? extraQueue
            : queue.length > 0
            ? queue
            : library;

        let target: Track | undefined;
        if (typeof trackIdOrTrack === 'object' && trackIdOrTrack.id) {
          target = trackIdOrTrack as Track;
          if (!target.isPreview && !activeList.some((t) => t.id === target!.id)) {
            activeList = [target, ...activeList];
          }
        } else {
          const targetId = String(trackIdOrTrack);
          target =
            activeList.find((t) => t.id === targetId || (t.videoId && t.videoId === targetId)) ||
            library.find((t) => t.id === targetId || (t.videoId && t.videoId === targetId)) ||
            (get().currentTrack?.id === targetId ? get().currentTrack! : undefined);
        }

        if (!target && args[0] && typeof args[0] === 'object' && args[0].id) {
          target = args[0] as Track;
        }

        if (target) {
          const nextQueue =
            target.isPreview || activeList.some((t) => t.id === target!.id)
              ? activeList
              : [target!, ...activeList];
          const nextLib =
            target.isPreview || library.some((t) => t.id === target!.id)
              ? library
              : [target!, ...library];

          set({
            currentTrack: target,
            nextTrackPreview: computeNextPreview(nextQueue, target),
            currentQueueId: target.isPreview ? get().currentQueueId : target.id,
            queue: nextQueue,
            queueItems: nextQueue,
            internalQueue: nextQueue,
            library: nextLib,
            playingPlaylistName: extraName,
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
        }
      },

      advanceNext: (reason?: any, ..._args: any[]) => {
        const {
          queue,
          library,
          currentTrack,
          currentQueueId,
          repeatMode,
          playNonce,
        } = get();

        const rawSource = queue.length > 1 ? queue : library.length > 0 ? library : queue;
        const validList = rawSource.filter((t) => isVaultTrack(t));

        if (validList.length === 0) {
          set({ isPlaying: false, progress: 0, currentTime: 0 });
          return;
        }

        if (reason === 'ended' && repeatMode === 'one' && currentTrack && !currentTrack.isPreview) {
          set({
            progress: 0,
            currentTime: 0,
            isPlaying: true,
            playNonce: playNonce + 1,
          });
          return;
        }

        if (validList.length === 1) {
          const singleTrack = validList[0];
          set({
            currentTrack: singleTrack,
            nextTrackPreview: singleTrack,
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

        let currIdx = -1;
        if (currentQueueId) {
          currIdx = validList.findIndex((t) => t.id === currentQueueId);
        }
        if (currIdx === -1 && currentTrack && !currentTrack.isPreview) {
          currIdx = validList.findIndex((t) => t.id === currentTrack.id);
        }

        if (currIdx >= 0 && currIdx < validList.length - 1) {
          const nextIdx = currIdx + 1;
          const nextTrack = validList[nextIdx];

          set({
            currentTrack: nextTrack,
            nextTrackPreview: computeNextPreview(validList, nextTrack),
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

        if (currIdx === -1) {
          const first = validList[0];
          set({
            currentTrack: first,
            nextTrackPreview: computeNextPreview(validList, first),
            currentQueueId: first.id,
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

        const shuffledList = shuffleTracksForReplay(validList, currentTrack?.id);
        const firstShuffled = shuffledList[0];

        set({
          queue: shuffledList,
          queueItems: shuffledList,
          internalQueue: shuffledList,
          currentTrack: firstShuffled,
          nextTrackPreview: computeNextPreview(shuffledList, firstShuffled),
          currentQueueId: firstShuffled.id,
          progress: 0,
          currentTime: 0,
          isPlaying: true,
          playNonce: playNonce + 1,
        });
      },

      advancePrev: (..._args: any[]) => {
        get().playPrevious();
      },

      playNext: (..._args: any[]) => {
        get().advanceNext('manual');
      },

      playPrevious: (..._args: any[]) => {
        const { queue, library, currentTrack, currentQueueId, progress, playNonce } =
          get();
        const rawSource = queue.length > 1 ? queue : library.length > 0 ? library : queue;
        const validList = rawSource.filter((t) => isVaultTrack(t));
        if (validList.length === 0) return;

        if (progress > 3 && currentTrack && !currentTrack.isPreview) {
          set({ progress: 0, currentTime: 0, isPlaying: true, playNonce: playNonce + 1 });
          return;
        }

        let currIdx = -1;
        if (currentQueueId) {
          currIdx = validList.findIndex((t) => t.id === currentQueueId);
        }
        if (currIdx === -1 && currentTrack && !currentTrack.isPreview) {
          currIdx = validList.findIndex((t) => t.id === currentTrack.id);
        }

        const prevIdx = currIdx > 0 ? currIdx - 1 : validList.length - 1;
        const prevTrack = validList[prevIdx];

        set({
          currentTrack: prevTrack,
          nextTrackPreview: computeNextPreview(validList, prevTrack),
          currentQueueId: prevTrack.id,
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
