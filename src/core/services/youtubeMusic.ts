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
}

export const youtubeMusic = new YoutubeMusicService();
