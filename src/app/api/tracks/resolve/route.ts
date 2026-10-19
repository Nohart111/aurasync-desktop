import { NextResponse } from "next/server";
import { checkFileExistsOnR2, getR2ObjectUrl } from "@/lib/r2-client";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";

interface ResolveRequest extends Partial<Track> {
  externalStreamUrl?: string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ResolveRequest;
    if (!payload.id || !payload.title) {
      return NextResponse.json({ error: "Track id and title are required." }, { status: 400 });
    }

    if (payload.externalStreamUrl) {
      return NextResponse.json(
        { error: "External media ingestion is disabled. Upload an audio file you own." },
        { status: 403 }
      );
    }

    const key = payload.r2Key || `tracks/${payload.id}.mp3`;
    if (!(await checkFileExistsOnR2(key))) {
      return NextResponse.json({ error: "Track is not present in the R2 catalog." }, { status: 404 });
    }

    const track: Track = {
      id: payload.id,
      title: payload.title,
      artist: payload.artist || "Unknown artist",
      album: payload.album || "AuraSound Studio",
      duration: payload.duration || 0,
      bpm: payload.bpm || 0,
      coverUrl: payload.coverUrl || "",
      dominantColors: payload.dominantColors || ["#00F0FF", "#8A2BE2"],
      streamUrl: getR2ObjectUrl(key),
    };

    return NextResponse.json({ status: "cached", track: { ...track, isCachedOnR2: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to resolve R2 track." },
      { status: 500 }
    );
  }
}
