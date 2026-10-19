export interface SoundCloudTrackResult {
  id: string;
  rawId: number;
  title: string;
  artist: string;
  duration: number;
  coverUrl: string;
  album: "SoundCloud";
  permalinkUrl: string;
}

interface SoundCloudSearchResponse {
  tracks?: SoundCloudTrackResult[];
  error?: string;
}

export async function searchSoundCloudTracks(
  query: string,
  signal?: AbortSignal
): Promise<SoundCloudTrackResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const params = new URLSearchParams({ q: normalizedQuery });
  const response = await fetch(`/api/soundcloud?${params}`, {
    signal,
    cache: "no-store",
  });
  const text = await response.text();
  if (!text.trim()) throw new Error("SoundCloud returned an empty response.");

  let payload: SoundCloudSearchResponse;
  try {
    payload = JSON.parse(text) as SoundCloudSearchResponse;
  } catch {
    throw new Error("SoundCloud returned invalid JSON.");
  }

  if (!response.ok) {
    throw new Error(payload.error || `SoundCloud search failed (${response.status}).`);
  }
  return payload.tracks ?? [];
}

export async function getSoundCloudPermalink(rawId: number): Promise<string> {
  const response = await fetch(`/api/soundcloud?id=${encodeURIComponent(rawId)}`, {
    cache: "no-store",
  });
  const text = await response.text();
  if (!text.trim()) throw new Error("SoundCloud returned an empty response.");

  let payload: Partial<SoundCloudTrackResult> & { error?: string };
  try {
    payload = JSON.parse(text) as Partial<SoundCloudTrackResult> & { error?: string };
  } catch {
    throw new Error("SoundCloud returned invalid JSON.");
  }

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `SoundCloud track lookup failed (${response.status}).`);
  }
  if (!payload.permalinkUrl) throw new Error("SoundCloud did not provide a track permalink.");
  return payload.permalinkUrl;
}
