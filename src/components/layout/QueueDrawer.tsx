"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ListMusic, Trash2, X, GripVertical } from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QueueDrawer({ isOpen, onClose }: QueueDrawerProps) {
  const { queueItems, queue, currentTrack, jumpToTrack, removeTrackFromQueue } =
    usePlayerStore();

  const list: Track[] = (queue && queue.length > 0 ? queue : queueItems) || [];

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
          className="fixed right-4 top-4 bottom-28 z-50 flex w-80 sm:w-96 flex-col rounded-2xl border border-white/10 bg-[#0c0c16]/95 p-5 shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <ListMusic className="h-5 w-5 text-neon-cyan" />
              <h2 className="font-mono text-sm font-bold tracking-tight text-white uppercase">
                Hàng đợi phát ({list.length})
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {list.length === 0 ? (
              <p className="mt-12 text-center text-xs font-mono text-zinc-500">
                Hàng đợi trống
              </p>
            ) : (
              list.map((track, i) => {
                const isPlaying = currentTrack?.id === track.id;
                const safeDuration = track.duration || 180;

                return (
                  <motion.div
                    layout="position"
                    key={track.id || i}
                    onClick={() => jumpToTrack(track.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded-xl p-2.5 transition ${
                      isPlaying
                        ? "bg-neon-cyan/20 border border-neon-cyan/40 shadow-sm"
                        : "hover:bg-white/5 text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden pr-2">
                      <span className="font-mono text-[10px] text-zinc-500 w-4 text-right shrink-0">
                        {i + 1}
                      </span>
                      <div className="truncate">
                        <p
                          className={`truncate text-xs font-semibold ${
                            isPlaying ? "text-neon-cyan" : "text-zinc-100"
                          }`}
                        >
                          {track.title}
                        </p>
                        <p className="truncate text-[10px] text-zinc-400">
                          {track.artist || "Nghệ sĩ chưa rõ"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-xs font-mono text-zinc-500">
                        {Math.floor(safeDuration / 60)}:
                        {String(Math.floor(safeDuration % 60)).padStart(2, "0")}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrackFromQueue(track.id);
                        }}
                        className="rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-400 group-hover:opacity-100 cursor-pointer"
                        title="Xóa khỏi hàng đợi"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export default QueueDrawer;
