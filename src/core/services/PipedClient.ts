export interface PipedSearchResult {
  type?: string;
  url?: string;
  videoId?: string;
  title?: string;
  uploaderName?: string;
  duration?: number;
  thumbnail?: string;
}

export interface PipedSearchResponse {
  items: PipedSearchResult[];
  attempts: number;
  instance?: string;
}

export class PipedRequestError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly status?: number
  ) {
    super(message);
    this.name = "PipedRequestError";
  }
}

export class PipedClient {
  async search(query: string, signal?: AbortSignal): Promise<PipedSearchResponse> {
    const params = new URLSearchParams({
      type: "search",
      q: query.trim(),
      filter: "music_songs",
    });
    const response = await fetch(`/api/piped?${params}`, { signal });
    const payload = (await response.json()) as
      | PipedSearchResult[]
      | { items?: PipedSearchResult[]; error?: string; attempts?: number };
    const attempts = Number(response.headers.get("x-piped-attempts")) ||
      (!Array.isArray(payload) && payload.attempts) || 1;

    if (!response.ok) {
      const message =
        !Array.isArray(payload) && payload.error
          ? payload.error
          : "Piped search is temporarily unavailable.";
      throw new PipedRequestError(message, attempts, response.status);
    }

    return {
      items: Array.isArray(payload) ? payload : payload.items ?? [],
      attempts,
      instance: response.headers.get("x-piped-instance") ?? undefined,
    };
  }
}

export const pipedClient = new PipedClient();
