import type { CatalogTrack } from '@/lib/api-types';

// Short-lived, per-server-instance cache of the merged track catalog, so page
// loads don't each wait ~1s on the GitHub API. Writes (delete, upload) clear it;
// clients that just changed the catalog request `?fresh=1`.

/** Served without revalidation for this long. */
export const CATALOG_FRESH_MS = 30_000;

let cached: { at: number; tracks: CatalogTrack[] } | null = null;

export function getCachedCatalog(): { tracks: CatalogTrack[]; isStale: boolean } | null {
  if (!cached) return null;
  return { tracks: cached.tracks, isStale: Date.now() - cached.at > CATALOG_FRESH_MS };
}

export function setCachedCatalog(tracks: CatalogTrack[]): void {
  cached = { at: Date.now(), tracks };
}

export function invalidateCatalogCache(): void {
  cached = null;
}
