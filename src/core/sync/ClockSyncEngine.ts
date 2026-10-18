export interface RoomPlaybackPayload {
  roomId: string;
  trackId: string;
  streamUrl: string;
  isPlaying: boolean;
  trackPositionSec: number; // Vị trí bài hát tại thời điểm Host phát lệnh
  serverTimestampMs: number; // Mốc thời gian chuẩn của Server khi đóng gói bản tin
}

/**
 * ClockSyncEngine: Tính toán độ lệch đồng hồ hệ thống (Clock Offset) giữa Client và Server
 * theo nguyên lý Network Time Protocol (NTP) qua cửa sổ trượt 5 mẫu có RTT thấp nhất.
 */
export class ClockSyncEngine {
  private samples: { rtt: number; offset: number }[] = [];
  private clockOffsetMs = 0;

  public recordPingPong(
    clientSendMs: number,
    serverTimeMs: number,
    clientReceiveMs: number
  ): void {
    const rtt = clientReceiveMs - clientSendMs;
    const estimatedServerTimeAtReceive = serverTimeMs + rtt / 2;
    const offset = estimatedServerTimeAtReceive - clientReceiveMs;

    this.samples.push({ rtt, offset });
    if (this.samples.length > 10) this.samples.shift();

    // Chọn mẫu có RTT nhỏ nhất (ít nhiễu hàng đợi mạng nhất)
    const bestSample = [...this.samples].sort((a, b) => a.rtt - b.rtt)[0];
    this.clockOffsetMs = bestSample.offset;
  }

  public getEstimatedServerNow(): number {
    return Date.now() + this.clockOffsetMs;
  }

  // Tính vị trí bài hát chính xác tại thời điểm gói tin vừa tới máy người nghe
  public computeCompensatedPosition(payload: RoomPlaybackPayload): number {
    if (!payload.isPlaying) return payload.trackPositionSec;
    const serverNow = this.getEstimatedServerNow();
    const transitDelaySec = Math.max(
      0,
      (serverNow - payload.serverTimestampMs) / 1000
    );
    return payload.trackPositionSec + transitDelaySec;
  }
}
