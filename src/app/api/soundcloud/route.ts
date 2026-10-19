import { NextResponse } from "next/server";

interface SoundCloudUser {
  username?: string;
}

interface SoundCloudTrack {
  id: number;
  title?: string;
  duration?: number;
  permalink_url?: string;
  artwork_url?: string | null;
  user?: SoundCloudUser;
}

function getClientId(): string | null {
  return process.env.SOUNDCLOUD_CLIENT_ID?.trim() || null;
}

function normalizeArtwork(url?: string | null): string {
  if (!url) return "";
  return url.replace("-large.jpg", "-t500x500.jpg");
}

function normalizeTrack(track: SoundCloudTrack) {
  return {
    id: `sc_${track.id}`,
    rawId: track.id,
    title: track.title || "Untitled track",
    artist: track.user?.username || "SoundCloud artist",
    duration: Math.round((track.duration || 0) / 1000),
    coverUrl: normalizeArtwork(track.artwork_url),
    album: "SoundCloud",
    permalinkUrl: track.permalink_url || "",
  };
}

async function soundCloudJson<T>(url: URL, clientId: string): Promise<T> {
  url.searchParams.set("client_id", clientId);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`SoundCloud returned HTTP ${response.status}.`);
  return (await response.json()) as T;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  const rawId = searchParams.get("id")?.trim();
  const clientId = getClientId();

  if (!clientId) {
    return NextResponse.json(
      { error: "SoundCloud is not configured. Set SOUNDCLOUD_CLIENT_ID on the server." },
      { status: 503 }
    );
  }

  if (query) {
    if (query.length > 180) {
      return NextResponse.json({ tracks: [], error: "Search query is too long." }, { status: 400 });
    }

    try {
      const endpoint = new URL("https://api-v2.soundcloud.com/search/tracks");
      endpoint.searchParams.set("q", query);
      endpoint.searchParams.set("limit", "20");
      const payload = await soundCloudJson<{ collection?: SoundCloudTrack[] }>(endpoint, clientId);
      return NextResponse.json({ tracks: (payload.collection ?? []).map(normalizeTrack) });
    } catch (error) {
      return NextResponse.json(
        { tracks: [], error: error instanceof Error ? error.message : "SoundCloud search failed." },
        { status: 502 }
      );
    }
  }

  if (rawId) {
    if (!/^\d+$/.test(rawId)) {
      return NextResponse.json({ error: "Invalid SoundCloud track ID." }, { status: 400 });
    }

    try {
      const endpoint = new URL(`https://api-v2.soundcloud.com/tracks/${rawId}`);
      const track = await soundCloudJson<SoundCloudTrack>(endpoint, clientId);
      return NextResponse.json({
        id: `sc_${track.id}`,
        rawId: track.id,
        title: track.title || "Untitled track",
        artist: track.user?.username || "SoundCloud artist",
        duration: Math.round((track.duration || 0) / 1000),
        coverUrl: normalizeArtwork(track.artwork_url),
        album: "SoundCloud",
        permalinkUrl: track.permalink_url || "",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to load SoundCloud track." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ tracks: [] });
}
