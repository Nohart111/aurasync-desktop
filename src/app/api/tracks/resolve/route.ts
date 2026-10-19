import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";

export interface ResolveRequest {
  trackId?: string;
  r2Key?: string;
  fileKey?: string;
  url?: string;
  [key: string]: any;
}

export async function POST(req: NextRequest) {
  await connection();
  try {
    const body: ResolveRequest = await req.json();
    const key = body.r2Key || body.fileKey || body.trackId || "";
    return NextResponse.json({
      streamUrl: body.url || `/api/tracks/stream?url=${encodeURIComponent(key)}`,
      r2Key: body.r2Key,
      trackId: body.trackId,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  await connection();
  const { searchParams } = new URL(req.url);
  const r2Key = searchParams.get("r2Key") || searchParams.get("key") || "";
  const trackId = searchParams.get("trackId") || "";
  return NextResponse.json({
    streamUrl: `/api/tracks/stream?url=${encodeURIComponent(r2Key || trackId)}`,
    r2Key,
    trackId,
  });
}
