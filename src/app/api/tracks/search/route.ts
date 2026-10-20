import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

function normalizeTrack(t: any) {
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

export async function GET(req: NextRequest) {
  const _t = req.nextUrl.searchParams.get('t');

  try {
    let localTracks: any[] = [];
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
            const validGhTracks = ghTracks
              .filter((t) => t && (t.streamUrl || t.cdnUrl))
              .map(normalizeTrack);

            return NextResponse.json(validGhTracks, {
              headers: { 'Cache-Control': 'no-store, max-age=0' },
            });
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
          const validRaw = rawTracks
            .filter((t) => t && (t.streamUrl || t.cdnUrl))
            .map(normalizeTrack);
          return NextResponse.json(validRaw, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
          });
        }
      }
    } catch {}

    // 3. Fallback về file local
    const normalizedLocal = localTracks.map(normalizeTrack);
    return NextResponse.json(normalizedLocal, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    if (err?.digest) throw err;
    return NextResponse.json([], { status: 200 });
  }
}
