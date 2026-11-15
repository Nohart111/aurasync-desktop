import { NextResponse, connection, after, type NextRequest } from 'next/server';
import { getCachedCatalog, setCachedCatalog } from '@/lib/catalog-cache';
import { isNextControlError, type CatalogTrack } from '@/lib/api-types';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

function slugifyTitle(text: string): string {
  return (text || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function normalizeTrack(t: CatalogTrack): CatalogTrack {
  const rawUrl = t.streamUrl || t.cdnUrl || '';
  let streamUrl = rawUrl;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    if (rawUrl.includes('/releases/download/')) {
      const parts = rawUrl.split('/');
      const filePart = parts[parts.length - 1];
      if (filePart) {
        streamUrl = `/api/tracks/stream?file=${encodeURIComponent(decodeURIComponent(filePart))}`;
      }
    } else {
      streamUrl = `/api/tracks/stream?url=${encodeURIComponent(rawUrl)}`;
    }
  } else if (rawUrl && !rawUrl.startsWith('/api/tracks/stream')) {
    streamUrl = `/api/tracks/stream?file=${encodeURIComponent(rawUrl)}`;
  }

  return {
    ...t,
    streamUrl,
  };
}

function deduplicateCatalogTracks(tracks: CatalogTrack[]): CatalogTrack[] {
  const seenKeys = new Set<string>();
  const result: CatalogTrack[] = [];

  for (const raw of tracks) {
    if (!raw || !(raw.streamUrl || raw.cdnUrl)) continue;
    const t = normalizeTrack(raw);
    const titleSlug = slugifyTitle(t.title || '');
    const key = titleSlug || t.videoId || t.id;
    if (!key) continue;

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(t);
    }
  }

  return result;
}

/** Reads the catalog: GitHub Contents API, then raw.githubusercontent.com, then the local file. */
async function loadCatalog(): Promise<CatalogTrack[]> {
  try {
    let localTracks: CatalogTrack[] = [];
    try {
      const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        localTracks = parsed.filter((t) => t && (t.streamUrl || t.cdnUrl));
      }
    } catch {}

    // 1. Đọc từ GitHub Contents API (có hoặc không có GITHUB_TOKEN)
    try {
      const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      };
      if (GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      }

      let ghRes = await fetch(apiUrl, { headers, cache: 'no-store' });
      if (!ghRes.ok && GITHUB_TOKEN) {
        ghRes = await fetch(apiUrl, {
          headers: { Accept: 'application/vnd.github+json' },
          cache: 'no-store',
        });
      }

      if (ghRes.ok) {
        const fileData = await ghRes.json();
        if (fileData?.content) {
          const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
          const ghTracks = JSON.parse(decoded);
          if (Array.isArray(ghTracks)) {
            const validGhTracks = deduplicateCatalogTracks(ghTracks);
            return validGhTracks;
          }
        }
      }
    } catch (e) {
      console.warn('GitHub API catalog fetch fallback:', e);
    }

    // 2. Fallback sang raw.githubusercontent.com
    try {
      const rawRes = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/data/catalog.json?t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (rawRes.ok) {
        const rawTracks = await rawRes.json();
        if (Array.isArray(rawTracks)) {
          const validRaw = deduplicateCatalogTracks(rawTracks);
          return validRaw;
        }
      }
    } catch {}

    // 3. Fallback về file local
    const normalizedLocal = deduplicateCatalogTracks(localTracks);
    return normalizedLocal;
  } catch (err) {
    if (isNextControlError(err)) throw err;
    return [];
  }
}

let refreshing = false;
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(req: NextRequest) {
  // Always read the live catalog; never prerender this handler at build time.
  await connection();
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';

  const cached = fresh ? null : getCachedCatalog();
  if (cached) {
    // Serve instantly; refresh in the background once it is stale.
    if (cached.isStale && !refreshing) {
      refreshing = true;
      after(async () => {
        try {
          const tracks = await loadCatalog();
          if (tracks.length > 0) setCachedCatalog(tracks);
        } finally {
          refreshing = false;
        }
      });
    }
    return NextResponse.json(cached.tracks, { headers: NO_STORE });
  }

  const tracks = await loadCatalog();
  if (tracks.length > 0) setCachedCatalog(tracks);
  return NextResponse.json(tracks, { headers: NO_STORE });
}
