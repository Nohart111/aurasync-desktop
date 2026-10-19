import { NextResponse } from "next/server";
import ytSearch from "yt-search";

const INVIDIOUS_INSTANCES = [
  "https://inv.tux.pizza/api/v1/search",
  "https://invidious.nerdvpn.de/api/v1/search",
] as const;

interface InvidiousVideo {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  videoThumbnails?: Array<{ quality?: string; url?: string }>;
}

function normalizeInvidiousVideo(video: InvidiousVideo) {
  if (!video.videoId || !video.title) return null;
  const thumbnail = [...(video.videoThumbnails ?? [])]
    .reverse()
    .find((item) => item.url)?.url;

  return {
    id: video.videoId,
    videoId: video.videoId,
    title: video.title,
    artist: video.author || "YouTube artist",
    duration: video.lengthSeconds ?? 0,
    coverUrl: thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
    watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length > 180) {
    return NextResponse.json({ results: [] }, { status: query ? 400 : 200 });
  }

  const provider = searchParams.get("provider");
  if (provider === "invidious") {
    const instanceIndex = Number(searchParams.get("instance"));
    if (!Number.isInteger(instanceIndex) || instanceIndex < 0 || instanceIndex >= INVIDIOUS_INSTANCES.length) {
      return NextResponse.json({ error: "Invalid Invidious instance selection." }, { status: 400 });
    }

    try {
      const endpoint = new URL(INVIDIOUS_INSTANCES[instanceIndex]);
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("type", "video");
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      });
      if (!response.ok) {
        return NextResponse.json({ error: `Invidious returned HTTP ${response.status}.` }, { status: 502 });
      }

      const payload = (await response.json()) as InvidiousVideo[];
      const results = payload
        .map(normalizeInvidiousVideo)
        .filter((video): video is NonNullable<typeof video> => video !== null)
        .slice(0, 20);
      return NextResponse.json({ results, provider: "invidious" });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invidious search failed." },
        { status: 502 }
      );
    }
  }

  try {
    const searchResult = await ytSearch(query);
    const results = searchResult.videos.slice(0, 20).map((video) => ({
      id: video.videoId,
      videoId: video.videoId,
      title: video.title,
      artist: video.author.name,
      duration: video.seconds,
      coverUrl: video.thumbnail || video.image,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`,
    }));

    return NextResponse.json({ results, provider: "yt-search" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "YouTube search failed." },
      { status: 502 }
    );
  }
}
