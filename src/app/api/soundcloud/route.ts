import { NextResponse } from "next/server";

interface SoundCloudUser {
  username?: string;
  verified?: boolean;
}

interface SoundCloudTrack {
  id: number;
  title?: string;
  duration?: number;
  playback_count?: number;
  kind?: string;
  permalink_url?: string;
  artwork_url?: string | null;
  user?: SoundCloudUser;
}

interface SoundCloudClientIdCache {
  value: string | null;
  expiresAt: number;
  pending?: Promise<string | null>;
}

const CLIENT_ID_CACHE_KEY = "__aurasoundSoundCloudClientIdCache__";
const CLIENT_ID_TTL_MS = 60 * 60 * 1000;
const MAX_BUNDLES_TO_SCAN = 12;
const SOUND_CLOUD_BLACKLIST =
  /\b(?:remix|speed\s*up|sped\s*up|slowed|reverb|cover|mashup|karaoke|beat|instrumental|tiktok|parody|reup)\b/i;
const SOUND_CLOUD_TITLE_TAGS =
  /\s*(?:\[(?:official audio|lyric video)\]|\((?:mv official|audio hd)\))\s*/gi;
const globalCache = globalThis as typeof globalThis & {
  [CLIENT_ID_CACHE_KEY]?: SoundCloudClientIdCache;
};
const clientIdCache = (globalCache[CLIENT_ID_CACHE_KEY] ??= {
  value: null,
  expiresAt: 0,
});

function extractScriptUrls(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const scriptTagPattern = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptTagPattern.exec(html)) !== null) {
    try {
      urls.push(new URL(match[2], pageUrl).toString());
    } catch {
      // Ignore malformed script references and continue scanning the page.
    }
  }

  return urls;
}

async function scrapeClientId(): Promise<string | null> {
  try {
    const homepage = await fetch("https://soundcloud.com", {
      headers: { "User-Agent": "Mozilla/5.0 AuraSound/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!homepage.ok) return null;

    const html = await homepage.text();
    const bundleUrls = extractScriptUrls(html, "https://soundcloud.com")
      .filter((url) => /\.js(?:\?|$)/i.test(url))
      .slice(-MAX_BUNDLES_TO_SCAN)
      .reverse();
    const clientIdPattern = /client_id[:=]["']([a-zA-Z0-9]{32})["']/;

    for (const bundleUrl of bundleUrls) {
      try {
        const bundleResponse = await fetch(bundleUrl, {
          headers: { "User-Agent": "Mozilla/5.0 AuraSound/1.0" },
          cache: "no-store",
          signal: AbortSignal.timeout(6000),
        });
        if (!bundleResponse.ok) continue;
        const bundle = await bundleResponse.text();
        const clientId = bundle.match(clientIdPattern)?.[1];
        if (clientId) return clientId;
      } catch {
        // A failed bundle should not prevent trying the remaining candidates.
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function getClientId(): Promise<string | null> {
  const configured = process.env.SOUNDCLOUD_CLIENT_ID?.trim();
  if (configured) return configured;

  if (clientIdCache.value && clientIdCache.expiresAt > Date.now()) {
    return clientIdCache.value;
  }

  if (!clientIdCache.pending) {
    clientIdCache.pending = scrapeClientId().finally(() => {
      clientIdCache.pending = undefined;
    });
  }

  const scraped = await clientIdCache.pending;
  if (scraped) {
    clientIdCache.value = scraped;
    clientIdCache.expiresAt = Date.now() + CLIENT_ID_TTL_MS;
    return scraped;
  }

  const fallback = process.env.SOUNDCLOUD_FALLBACK_CLIENT_ID?.trim();
  if (fallback) {
    clientIdCache.value = fallback;
    clientIdCache.expiresAt = Date.now() + CLIENT_ID_TTL_MS;
    return fallback;
  }

  return null;
}

function normalizeArtwork(url?: string | null): string {
  if (!url) return "";
  return url.replace("-large.jpg", "-t500x500.jpg");
}

function normalizeTrack(track: SoundCloudTrack) {
  return {
    id: `sc_${track.id}`,
    rawId: track.id,
    title: (track.title || "Untitled track")
      .replace(SOUND_CLOUD_TITLE_TAGS, " ")
      .replace(/\s+/g, " ")
      .trim(),
    artist: track.user?.username || "SoundCloud artist",
    artistVerified: track.user?.verified || false,
    duration: Math.round((track.duration || 0) / 1000),
    coverUrl: normalizeArtwork(track.artwork_url),
    album: "SoundCloud",
    permalinkUrl: track.permalink_url || "",
    playbackCount: track.playback_count || 0,
  };
}

function rankSearchTracks(
  tracks: SoundCloudTrack[],
  query: string
): SoundCloudTrack[] {
  const queryTerms = query
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2);

  return tracks
    .filter((track) =>
      (track.duration ?? 0) > 60 &&
      !SOUND_CLOUD_BLACKLIST.test(track.title || "")
    )
    .sort((left, right) => score(right) - score(left));

  function score(track: SoundCloudTrack): number {
    const artist = track.user?.username?.toLocaleLowerCase() || "";
    const title = track.title?.toLocaleLowerCase() || "";
    const artistMatches = queryTerms.filter(
      (term) => artist.includes(term) || title.includes(term)
    ).length;
    const verifiedBonus = track.user?.verified ? 1_000_000_000_000 : 0;
    const artistMatchBonus = artistMatches * 1_000_000_000;
    const playbackScore = Math.max(0, track.playback_count ?? 0);
    return verifiedBonus + artistMatchBonus + playbackScore;
  }
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
  const clientId = await getClientId();

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Unable to obtain a SoundCloud client ID. Configure SOUNDCLOUD_CLIENT_ID or SOUNDCLOUD_FALLBACK_CLIENT_ID.",
      },
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
      const tracks = rankSearchTracks(payload.collection ?? [], query)
        .map(normalizeTrack)
      return NextResponse.json({ tracks });
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
        playbackCount: track.playback_count || 0,
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
