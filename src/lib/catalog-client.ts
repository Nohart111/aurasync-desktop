'use client';

import type { Track } from '@/store/usePlayerStore';

let inflight: Promise<Track[]> | null = null;

/**
 * Fetches the track catalog. Concurrent callers share one request. Pass
 * `fresh: true` right after changing the catalog to skip the server cache.
 */
export function fetchCatalog({ fresh = false }: { fresh?: boolean } = {}): Promise<Track[]> {
  if (inflight && !fresh) return inflight;

  const request = fetch(`/api/tracks/search${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : []))
    .then((data): Track[] => (Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : []))
    .finally(() => {
      if (inflight === request) inflight = null;
    });

  inflight = request;
  return request;
}
