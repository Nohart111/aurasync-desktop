// src/app/api/tracks/upload/route.ts
import { NextResponse } from "next/server";
import { uploadTrackToGitHubRelease } from "@/lib/github-storage";
import { saveTrackToCatalog } from "@/lib/local-catalog";
import { Track } from "@/core/algorithms/DoublyLinkedQueue";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title =
      (formData.get("title") as string) ||
      file?.name.replace(/\.[^/.]+$/, "") ||
      "Untitled";
    const artist = (formData.get("artist") as string) || "AuraSound Artist";
    const duration = Number(formData.get("duration")) || 180;

    if (!file) {
      return NextResponse.json({ error: "Không tìm thấy file nhạc" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safeFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const streamUrl = await uploadTrackToGitHubRelease(
      buffer,
      safeFileName,
      file.type || "audio/mpeg"
    );

    const track: Track = {
      id: crypto.randomUUID(),
      title,
      artist,
      album: "AuraSound Cloud",
      duration,
      bpm: 120,
      streamUrl,
      coverUrl:
        "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop",
      dominantColors: ["#8A2BE2", "#00F0FF"],
    };

    await saveTrackToCatalog(track);
    return NextResponse.json({ success: true, track });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Upload thất bại" },
      { status: 500 }
    );
  }
}