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
const roomStates = new Map();
io.on("connection", (socket) => {
    // Phản hồi tức thời gói tin đo độ trễ đồng hồ NTP
    socket.on("ntp:ping", ({ clientSendMs }) => {
        socket.emit("ntp:pong", {
            clientSendMs,
            serverTimeMs: Date.now(),
        });
    });
    socket.on("room:join", ({ roomId }) => {
        socket.join(roomId);
        const existingState = roomStates.get(roomId);
        if (existingState) {
            socket.emit("room:sync-state", existingState);
        }
    });
    socket.on("room:host-update", (data) => {
        const updatedState = {
            ...data,
            serverTimestampMs: Date.now(),
        };
        roomStates.set(data.roomId, updatedState);
        socket.to(data.roomId).emit("room:sync-state", updatedState);
    });
});
const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
    console.log(`[AuraSync Realtime Server] Listening on port ${PORT}`);
});
