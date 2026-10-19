import { NextResponse } from "next/server";

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
  viewCount?: number;
  videoThumbnails?: Array<{ quality?: string; url?: string }>;
}

interface ItunesSong {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  previewUrl?: string;
}

interface ItunesSearchResponse {
  results?: ItunesSong[];
}

async function safeFetchJson<T>(
  url: string,
  options?: RequestInit
): Promise<T | null> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) return null;
    const text = await response.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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
    views: video.viewCount ?? 0,
    coverUrl: thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
    watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query) return NextResponse.json({ results: [] });
    if (query.length > 180) {
      return NextResponse.json({ results: [], error: "Search query is too long." }, { status: 400 });
    }

    const provider = searchParams.get("provider");
    if (provider === "invidious") {
      const instanceIndex = Number(searchParams.get("instance"));
      if (!Number.isInteger(instanceIndex) || instanceIndex < 0 || instanceIndex >= INVIDIOUS_INSTANCES.length) {
        return NextResponse.json({ results: [], error: "Invalid Invidious instance selection." }, { status: 400 });
      }

      const endpoint = new URL(INVIDIOUS_INSTANCES[instanceIndex]);
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("type", "video");
      const payload = await safeFetchJson<InvidiousVideo[]>(endpoint.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      });
      if (!payload || !Array.isArray(payload)) {
        return NextResponse.json({ results: [], error: "Invidious returned an empty or invalid response." }, { status: 502 });
      }

      const results = payload
        .map(normalizeInvidiousVideo)
        .filter((video): video is NonNullable<typeof video> => video !== null)
        .slice(0, 20);
      return NextResponse.json({ results, provider: "invidious" });
    }

    try {
      const { default: ytSearch } = await import("yt-search");
    const searchResult = await ytSearch(query);
    const results = searchResult.videos.slice(0, 20).map((video) => ({
      id: video.videoId,
      videoId: video.videoId,
      title: video.title,
      artist: video.author?.name || "YouTube Music",
      duration: video.seconds,
      views: video.views || 0,
      coverUrl: video.thumbnail || video.image,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`,
    }));

    return NextResponse.json({ results, provider: "yt-search" });
    } catch {
      const itunesUrl = new URL("https://itunes.apple.com/search");
      itunesUrl.searchParams.set("term", query);
      itunesUrl.searchParams.set("country", "VN");
      itunesUrl.searchParams.set("entity", "song");
      itunesUrl.searchParams.set("limit", "20");

      const itunesData = await safeFetchJson<ItunesSearchResponse>(itunesUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(7000),
        cache: "no-store",
      });

      if (itunesData) {
        const results = (itunesData.results ?? [])
          .filter((song) => song.trackId !== undefined && song.trackName)
          .map((song) => ({
            id: String(song.trackId),
            videoId: "",
            title: song.trackName!,
            artist: song.artistName || "Apple Music",
            duration: Math.round((song.trackTimeMillis || 0) / 1000),
            views: 0,
            coverUrl: song.artworkUrl100?.replace("100x100bb", "600x600bb") || "",
            watchUrl: "",
            streamUrl: song.previewUrl || "",
            provider: "itunes" as const,
          }));
        return NextResponse.json({ results, provider: "itunes-fallback" });
      }

      return NextResponse.json(
        { results: [], error: "YouTube and iTunes search are temporarily unavailable." },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { results: [], error: "YouTube search failed unexpectedly." },
      { status: 500 }
    );
  }
}
