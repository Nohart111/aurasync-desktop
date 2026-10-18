// realtime-server/src/server.ts
import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

interface RoomState {
  roomId: string;
  trackId: string;
  streamUrl: string;
  isPlaying: boolean;
  trackPositionSec: number;
  serverTimestampMs: number;
}

const roomStates = new Map<string, RoomState>();

io.on("connection", (socket) => {
  // Phản hồi tức thời gói tin đo độ trễ đồng hồ NTP
  socket.on("ntp:ping", ({ clientSendMs }: { clientSendMs: number }) => {
    socket.emit("ntp:pong", {
      clientSendMs,
      serverTimeMs: Date.now(),
    });
  });

  socket.on("room:join", ({ roomId }: { roomId: string }) => {
    socket.join(roomId);
    const existingState = roomStates.get(roomId);
    if (existingState) {
      socket.emit("room:sync-state", existingState);
    }
  });

  socket.on(
    "room:host-update",
    (data: Omit<RoomState, "serverTimestampMs">) => {
      const updatedState: RoomState = {
        ...data,
        serverTimestampMs: Date.now(),
      };
      roomStates.set(data.roomId, updatedState);
      socket.to(data.roomId).emit("room:sync-state", updatedState);
    }
  );
});

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`[AuraSync Realtime Server] Listening on port ${PORT}`);
});