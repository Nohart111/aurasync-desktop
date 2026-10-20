import { NextResponse } from 'next/server';

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');
    const directUrl = searchParams.get('url');

    let targetUrl = '';
    if (directUrl && directUrl.startsWith('https://')) {
      targetUrl = directUrl;
    } else if (file) {
      const cleanFile = file.replace(/^\/+|\/+$/g, '');
      targetUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${GITHUB_RELEASE_TAG}/${encodeURIComponent(
        cleanFile
      )}`;
    } else {
      return NextResponse.json({ error: 'Thiếu tham số file.' }, { status: 400 });
    }

    // Phân giải URL redirect 302 để lấy thẳng URL CDN đích, tránh mất Range Header
    let finalUrl = targetUrl;
    try {
      const redirectCheck = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'AuraSound-Player/2.0' },
        redirect: 'manual',
      });
      if (
        redirectCheck.status === 302 ||
        redirectCheck.status === 301 ||
        redirectCheck.status === 307
      ) {
        const loc = redirectCheck.headers.get('location');
        if (loc) finalUrl = loc;
      }
    } catch {}

    const rangeHeader = req.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'AuraSound-Player/2.0',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    const upstream = await fetch(finalUrl, {
      headers: fetchHeaders,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: 'Không tìm thấy file nhạc trên CDN.' },
        { status: upstream.status }
      );
    }

    const mimeType = getMimeType(file || targetUrl);
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
    console.error('Lỗi Stream API:', err);
    return NextResponse.json({ error: 'Lỗi truyền tải âm thanh.' }, { status: 500 });
  }
}
