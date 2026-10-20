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
  // Đọc searchParams bên ngoài try-catch để Next.js 16 luôn xử lý Dynamic thời gian thực
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

    // Đọc trực tiếp từ GitHub Contents API với cache: 'no-store' (0s độ trễ cache)
    if (GITHUB_TOKEN) {
      try {
        const ghRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
            },
            cache: 'no-store',
          }
        );

        if (ghRes.ok) {
          const fileData = await ghRes.json();
          if (fileData?.content) {
            const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
            const ghTracks = JSON.parse(decoded);
            if (Array.isArray(ghTracks)) {
              const validGhTracks = ghTracks
                .filter((t) => t && (t.streamUrl || t.cdnUrl))
                .map(normalizeTrack);

              // Đồng bộ ngược về file local nếu đang chạy ở localhost
              try {
                await fs.writeFile(CATALOG_PATH, JSON.stringify(validGhTracks, null, 2), 'utf-8');
              } catch {}

              return NextResponse.json(validGhTracks, {
                headers: { 'Cache-Control': 'no-store, max-age=0' },
              });
            }
          }
        }
      } catch (e) {
        console.warn('GitHub catalog fetch fallback to local:', e);
      }
    }

    const normalizedLocal = localTracks.map(normalizeTrack);
    return NextResponse.json(normalizedLocal, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    if (err?.digest) throw err;
    return NextResponse.json([], { status: 200 });
  }
}
