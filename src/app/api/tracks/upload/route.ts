import { NextResponse } from "next/server";
import { appendTrackToR2Catalog, streamAudioToR2 } from "@/lib/r2-client";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/ogg",
]);
const DEFAULT_COVER =
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 100 MB." }, { status: 413 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const allowedExtensions = new Set(["mp3", "flac", "m4a", "wav", "aac", "ogg"]);
    if (!allowedExtensions.has(extension)) {
      return NextResponse.json({ error: "Unsupported audio format." }, { status: 415 });
    }
    if (file.type && !ALLOWED_AUDIO_TYPES.has(file.type.toLowerCase())) {
      return NextResponse.json({ error: "Unsupported audio content type." }, { status: 415 });
    }

    const id = `r2_${crypto.randomUUID()}`;
    const key = `tracks/${id}.${extension}`;
    const contentType = file.type || "application/octet-stream";
    const streamUrl = await streamAudioToR2(key, file.stream(), contentType);
    const title = file.name.replace(/\.[^.]+$/, "") || "Untitled track";
    const track: Track = {
      id,
      r2Key: key,
      title,
      artist: "My Library",
      album: "AuraSound Studio",
      duration: 0,
      bpm: 0,
      streamUrl,
      coverUrl: DEFAULT_COVER,
      dominantColors: ["#00F0FF", "#8A2BE2"],
    };

    await appendTrackToR2Catalog(track);
    return NextResponse.json({ track: { ...track, isCachedOnR2: true } }, { status: 201 });
  } catch (error) {
    console.error("R2 audio upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audio upload failed." },
      { status: 500 }
    );
  }
}
