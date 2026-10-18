// src/hooks/useRoomSync.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import {
  ClockSyncEngine,
  RoomPlaybackPayload,
} from "@/core/sync/ClockSyncEngine";
import { AudioEngine } from "@/core/audio/AudioEngine";
import { usePlayerStore } from "@/store/usePlayerStore";

const DRIFT_TOLERANCE_SEC = 0.04; // Ngưỡng 40ms: nhỏ hơn ngưỡng này tai người không phân biệt được

export function useRoomSync(roomId: string) {
  const socketRef = useRef<Socket | null>(null);
  const clockSyncRef = useRef(new ClockSyncEngine());
  const { jumpToTrack, setPlaying } = usePlayerStore();

  useEffect(() => {
    const socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000",
      { transports: ["websocket"] }
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomId });
      // Gửi 5 nhịp đo NTP liên tiếp khi vừa vào phòng
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          socket.emit("ntp:ping", { clientSendMs: Date.now() });
        }, i * 300);
      }
    });

    socket.on(
      "ntp:pong",
      (data: { clientSendMs: number; serverTimeMs: number }) => {
        clockSyncRef.current.recordPingPong(
          data.clientSendMs,
          data.serverTimeMs,
          Date.now()
        );
      }
    );

    socket.on("room:sync-state", async (payload: RoomPlaybackPayload) => {
      const engine = AudioEngine.getInstance();
      const targetPosition =
        clockSyncRef.current.computeCompensatedPosition(payload);

      jumpToTrack(payload.trackId);

      const currentDrift = Math.abs(engine.getCurrentTime() - targetPosition);
      if (currentDrift > DRIFT_TOLERANCE_SEC) {
        engine.seek(targetPosition);
      }

      if (payload.isPlaying) {
        await engine.play();
        setPlaying(true);
      } else {
        engine.pause();
        setPlaying(false);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, jumpToTrack, setPlaying]);

  // Hàm dành cho Host/DJ phát lệnh đồng bộ tới toàn bộ bạn bè trong phòng
  const broadcastPlaybackAction = useCallback(
    (trackId: string, streamUrl: string, isPlaying: boolean) => {
      if (!socketRef.current) return;
      const engine = AudioEngine.getInstance();
      socketRef.current.emit("room:host-update", {
        roomId,
        trackId,
        streamUrl,
        isPlaying,
        trackPositionSec: engine.getCurrentTime(),
      });
    },
    [roomId]
  );

  return { broadcastPlaybackAction };
}
