// src/app/api/nct/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const songKey = searchParams.get("key");

  try {
    // Dynamic import để tránh lỗi CJS/ESM của Next.js App Router
    // @ts-ignore
    const nctModule = await import("nhaccuatui-api-full");
    const NCT = nctModule.default || nctModule;

    // 1. Nếu truyền songKey -> Lấy chi tiết link stream MP3 của bài hát
    if (songKey) {
      const songData = await NCT.getSong(songKey);
      const song = songData?.song;
      if (!song) {
        return NextResponse.json({ error: "Không tìm thấy bài hát" }, { status: 404 });
      }

      // Lấy link MP3 trực tiếp (128kbps hoặc 320kbps)
      const directStream =
        song.streamUrls?.[0]?.streamUrl ||
        song.location ||
        song.streamUrl ||
        "";

      return NextResponse.json({
        id: `nct_${song.key || songKey}`,
        title: song.title || "Unknown",
        artist: (song.artists || []).map((a: any) => a.name).join(", ") || "Various Artists",
        album: song.album?.title || "NhacCuaTui Single",
        duration: song.duration || 210,
        bpm: 120,
        coverUrl: song.thumbnail || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
        streamUrl: directStream,
        dominantColors: ["#00F0FF", "#8A2BE2"],
      });
    }

    // 2. Nếu truyền query -> Tìm kiếm bài hát theo từ khóa
    if (!query) {
      return NextResponse.json({ error: "Thiếu từ khóa q" }, { status: 400 });
    }

    const searchResult = await NCT.searchByKeyword(query);
    const rawSongs = searchResult?.search?.song?.song || [];

    // Chuẩn hóa danh sách bài hát theo Track interface của AuraSound
    const tracks = rawSongs.slice(0, 15).map((item: any) => ({
      id: `nct_${item.key}`,
      key: item.key,
      title: item.title,
      artist: (item.artists || []).map((a: any) => a.name).join(", ") || "Nghệ sĩ NCT",
      album: "NhacCuaTui",
      duration: item.duration || 200,
      bpm: 120,
      coverUrl: item.thumbnail || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
      dominantColors: ["#00F0FF", "#8A2BE2"],
    }));

    return NextResponse.json({ tracks });
  } catch (error: any) {
    console.error("[NCT API Error]:", error);
    return NextResponse.json(
      { error: "Lỗi kết nối NCT API", details: error.message },
      { status: 500 }
    );
  }
}