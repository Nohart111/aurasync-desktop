import { NextResponse } from "next/server";
import { PlaylistSearchEngine } from "@/core/algorithms/PlaylistSearchEngine";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";
import { getR2Catalog } from "@/lib/r2-client";

interface ItunesSearchResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  previewUrl?: string;
}

async function getExternalSuggestions(query: string): Promise<Array<Track & {
  isCachedOnR2: false;
  externalStreamUrl?: string;
}>> {
  try {
    const endpoint = new URL("https://itunes.apple.com/search");
    endpoint.searchParams.set("term", query);
    endpoint.searchParams.set("media", "music");
    endpoint.searchParams.set("entity", "song");
    endpoint.searchParams.set("limit", "10");

    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: ItunesSearchResult[] };

    return (payload.results ?? []).map((song) => ({
      id: `itunes-${song.trackId}`,
      title: song.trackName,
      artist: song.artistName,
      album: song.collectionName || "iTunes preview",
      duration: Math.round((song.trackTimeMillis || 0) / 1000),
      bpm: 0,
      streamUrl: song.previewUrl || "",
      externalStreamUrl: song.previewUrl || undefined,
      coverUrl: song.artworkUrl100?.replace("100x100bb", "600x600bb") || "",
      dominantColors: ["#FF2A85", "#00F0FF"],
      isCachedOnR2: false as const,
    }));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length > 180) {
    return NextResponse.json({ tracks: [], error: "Search query is too long." }, { status: 400 });
  }

  try {
    const catalog = await getR2Catalog();
    const searchEngine = new PlaylistSearchEngine();
    searchEngine.indexTracks(catalog);
    const cachedTracks = searchEngine.searchByPrefix(query).map((track) => ({
      ...track,
      isCachedOnR2: true as const,
    }));

    if (cachedTracks.length >= 5 || query.length === 0) {
      return NextResponse.json({ tracks: cachedTracks });
    }

    const suggestions = await getExternalSuggestions(query);
    const cachedIds = new Set(cachedTracks.map((track) => track.id));
    const uniqueSuggestions = suggestions.filter((track) => !cachedIds.has(track.id));
    return NextResponse.json({ tracks: [...cachedTracks, ...uniqueSuggestions] });
  } catch (error) {
    return NextResponse.json(
      { tracks: [], error: error instanceof Error ? error.message : "Track search failed." },
      { status: 500 }
    );
  }
}
