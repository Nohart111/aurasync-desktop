// src/components/layout/QueueDrawer.tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ListMusic, Trash2, X, GripVertical } from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QueueDrawer({ isOpen, onClose }: QueueDrawerProps) {
  const { queueItems, currentTrack, jumpToTrack, removeTrackFromQueue } =
    usePlayerStore();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: "100%", opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 380,
            damping: 34,
            mass: 0.8,
          }}
          className="glass-acrylic gpu-accelerated fixed right-4 top-4 bottom-28 z-40 flex w-96 flex-col rounded-2xl p-5"
        >
          <div className="flex items-center justify-between border-b border-glass-border pb-4">
            <div className="flex items-center gap-2.5">
              <ListMusic className="h-5 w-5 text-neon-cyan" />
              <h2 className="font-display text-base font-bold tracking-tight text-white">
                Hàng đợi phát ({queueItems.length})
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {queueItems.map((track) => {
              const isPlaying = currentTrack?.id === track.id;
              return (
                <motion.div
                  layout="position"
                  key={track.id}
                  onClick={() => jumpToTrack(track.id)}
                  className={`group flex cursor-pointer items-center justify-between rounded-xl p-2.5 transition ${
                    isPlaying
                      ? "bg-neon-violet/20 border border-neon-violet/40 shadow-neon-violet"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <GripVertical className="h-4 w-4 shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100" />
                    <div className="truncate">
                      <p
                        className={`truncate text-sm font-medium ${
                          isPlaying ? "text-neon-cyan" : "text-zinc-100"
                        }`}
                      >
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-zinc-400">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="tabular-time text-xs text-zinc-500">
                      {Math.floor(track.duration / 60)}:
                      {String(Math.floor(track.duration % 60)).padStart(2, "0")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrackFromQueue(track.id);
                      }}
                      className="rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}