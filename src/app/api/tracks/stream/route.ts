import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';
const GITHUB_RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg';
  return 'audio/mpeg';
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fileParam = searchParams.get('file');
  const directUrl = searchParams.get('url');

  if (!fileParam && !directUrl) {
    return NextResponse.json({ error: 'Thiếu tham số file.' }, { status: 400 });
  }

  let inferredFile = fileParam || '';
  if (!inferredFile && directUrl && directUrl.includes('/releases/download/')) {
    const parts = directUrl.split('/');
    inferredFile = parts[parts.length - 1] || '';
  }

  let targetUrl = '';
  if (directUrl && directUrl.startsWith('https://')) {
    targetUrl = directUrl;
  } else if (inferredFile) {
    const cleanFile = decodeURIComponent(inferredFile).replace(/^\/+|\/+$/g, '');
    targetUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${GITHUB_RELEASE_TAG}/${encodeURIComponent(
      cleanFile
    )}`;
  }

  try {
    const rangeHeader = req.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    let upstream = await fetch(targetUrl, {
      headers: fetchHeaders,
      redirect: 'follow',
      cache: 'no-store',
    });

    // Nếu không tìm thấy theo tên chính xác, dò trong danh sách assets của Release tracks-v1 (kể cả khi không có GITHUB_TOKEN vì repo public)
    if (!upstream.ok && upstream.status !== 206 && inferredFile) {
      try {
        const apiHeaders: Record<string, string> = {
          Accept: 'application/vnd.github+json',
        };
        if (GITHUB_TOKEN) {
          apiHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
        }

        let relRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
          {
            headers: apiHeaders,
            cache: 'no-store',
          }
        );

        if (!relRes.ok && GITHUB_TOKEN) {
          relRes = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
            {
              headers: { Accept: 'application/vnd.github+json' },
              cache: 'no-store',
            }
          );
        }

        if (relRes.ok) {
          const relData = await relRes.json();
          const clean = decodeURIComponent(inferredFile).toLowerCase();
          const prefix = clean.replace(/-\d+\.[a-z0-9]+$/, '');
          const matchedAsset = (relData.assets || []).find(
            (a: any) =>
              a.name &&
              (a.name.toLowerCase() === clean ||
                (prefix.length > 3 && a.name.toLowerCase().startsWith(prefix)))
          );
          if (matchedAsset?.browser_download_url) {
            upstream = await fetch(matchedAsset.browser_download_url, {
              headers: fetchHeaders,
              redirect: 'follow',
              cache: 'no-store',
            });
          }
        }
      } catch {}
    }

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: 'Không tìm thấy file nhạc trên CDN.' },
        { status: upstream.status }
      );
    }

    const mimeType = getMimeType(inferredFile || targetUrl);
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', mimeType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    if (err?.digest) throw err;
    console.error('Lỗi Stream API:', err);
    return NextResponse.json({ error: 'Lỗi truyền tải âm thanh.' }, { status: 500 });
  }
}
