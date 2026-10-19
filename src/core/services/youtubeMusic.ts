export interface YoutubeMusicResult {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  coverUrl: string;
  watchUrl: string;
  streamUrl?: string;
  provider?: "yt-search" | "invidious" | "itunes";
}

interface YoutubeSearchResponse {
  results?: YoutubeMusicResult[];
  error?: string;
}

const INVIDIOUS_FALLBACK_INSTANCE_COUNT = 2;
const YOUTUBE_NOISE_PATTERN =
  /\b(?:cover|karaoke|beat|reaction|slowed|reverb|1\s*hour|1h)\b|nhạc\s*chế/i;

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

export class YoutubeMusicSearchError extends Error {
  constructor(
    message: string,
    public readonly attempts: number
  ) {
    super(message);
    this.name = "YoutubeMusicSearchError";
  }
}

export class YoutubeMusicService {
  async search(query: string, signal?: AbortSignal): Promise<YoutubeMusicResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    const attempts: string[] = [];
    try {
      return await this.fetchResults(normalizedQuery, undefined, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      attempts.push(
        error instanceof Error ? error.message : "Internal YouTube search failed."
      );
    }

    for (let instance = 0; instance < INVIDIOUS_FALLBACK_INSTANCE_COUNT; instance += 1) {
      if (signal?.aborted) throw new DOMException("Search cancelled.", "AbortError");
      try {
        return await this.fetchResults(normalizedQuery, instance, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        attempts.push(
          error instanceof Error ? error.message : `Invidious fallback ${instance + 1} failed.`
        );
      }
    }

    throw new YoutubeMusicSearchError(
      `YouTube search failed after ${attempts.length} attempts. ${attempts.join("; ")}`,
      attempts.length
    );
  }

  async findBestMatch(
    artist: string,
    title: string,
    duration: number,
    signal?: AbortSignal
  ): Promise<YoutubeMusicResult | null> {
    const query = `${artist} ${title}`.trim();
    const results = await this.search(query, signal);
    const candidates = results.filter(
      (result) => result.videoId && !YOUTUBE_NOISE_PATTERN.test(result.title)
    );
    if (candidates.length === 0) return null;

    const withDuration = candidates.filter(
      (result) => Number.isFinite(result.duration) && result.duration > 0
    );
    const closeMatches = withDuration.filter(
      (result) => Math.abs(result.duration - duration) <= 25
    );
    if (closeMatches.length === 0) {
      return withDuration.sort(
        (left, right) =>
          Math.abs(left.duration - duration) - Math.abs(right.duration - duration)
      )[0] ?? candidates[0];
    }

    return closeMatches.sort((left, right) => {
      const leftOfficial = this.isPreferredChannel(left, artist) ? 1 : 0;
      const rightOfficial = this.isPreferredChannel(right, artist) ? 1 : 0;
      if (leftOfficial !== rightOfficial) return rightOfficial - leftOfficial;
      return (
        Math.abs(left.duration - duration) - Math.abs(right.duration - duration)
      );
    })[0];
  }

  private async fetchResults(
    query: string,
    invidiousInstance: number | undefined,
    signal?: AbortSignal
  ): Promise<YoutubeMusicResult[]> {
    const params = new URLSearchParams({ q: query });
    if (invidiousInstance !== undefined) {
      params.set("provider", "invidious");
      params.set("instance", String(invidiousInstance));
    }

    const payload = await safeFetchJson<YoutubeSearchResponse>(
      `/api/youtube/search?${params}`,
      { signal, cache: "no-store" }
    );
    if (!payload) throw new Error("YouTube search returned an empty or invalid JSON response.");
    if (payload.error) throw new Error(payload.error);
    return payload.results ?? [];
  }

  private isPreferredChannel(result: YoutubeMusicResult, artist: string): boolean {
    const channel = result.artist.toLocaleLowerCase();
    const normalizedArtist = artist.toLocaleLowerCase().trim();
    return (
      (normalizedArtist.length > 0 && channel.includes(normalizedArtist)) ||
      /\b(?:official|mv|audio)\b/i.test(channel)
    );
  }
}

export const youtubeMusic = new YoutubeMusicService();
