import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';
const GITHUB_RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';

function getMimeType(filename: string): string {
  const clean = filename.split('?')[0].toLowerCase();
  if (clean.endsWith('.m4a') || clean.endsWith('.mp4')) return 'audio/mp4';
  if (clean.endsWith('.webm')) return 'audio/webm';
  if (clean.endsWith('.flac')) return 'audio/flac';
  if (clean.endsWith('.wav')) return 'audio/wav';
  if (clean.endsWith('.ogg') || clean.endsWith('.opus')) return 'audio/ogg';
  return 'audio/mpeg';
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Access-Control-Max-Age': '86400',
    },
  });
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

    // BƯỚC 1: Xử lý chuyển hướng 302 thủ công
    // QUAN TRỌNG: Không gửi Range header lên github.com (endpoint chuyển hướng) vì proxy GitHub sẽ trả về lỗi 400.
    // Chỉ gửi Range header lên endpoint lưu trữ thực tế (AWS S3: objects.githubusercontent.com).
    let upstream: Response | null = null;
    let currentFetchUrl = targetUrl;

    for (let redirectCount = 0; redirectCount < 4; redirectCount++) {
      const isStorageEndpoint =
        currentFetchUrl.includes('githubusercontent.com') ||
        currentFetchUrl.includes('amazonaws.com') ||
        currentFetchUrl.includes('s3');

      const stepHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };
      if (rangeHeader && isStorageEndpoint) {
        stepHeaders['Range'] = rangeHeader;
      }

      const resp = await fetch(currentFetchUrl, {
        headers: stepHeaders,
        redirect: 'manual',
        cache: 'no-store',
      });

      if (resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) {
        const loc = resp.headers.get('location');
        if (loc) {
          currentFetchUrl = loc;
          continue;
        }
      }

      upstream = resp;
      break;
    }

    // BƯỚC 2: Nếu tải trực tiếp không thành công (ví dụ: kho private hoặc tên file có sai khác),
    // truy vấn trực tiếp GitHub Release API để lấy asset nhị phân qua Accept: application/octet-stream
    if ((!upstream || (!upstream.ok && upstream.status !== 206)) && inferredFile) {
      try {
        const apiHeaders: Record<string, string> = {
          Accept: 'application/vnd.github+json',
        };
        if (GITHUB_TOKEN) {
          apiHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
        }

        const relRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
          { headers: apiHeaders, cache: 'no-store' }
        );

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

          if (matchedAsset && matchedAsset.url) {
            const assetHeaders: Record<string, string> = {
              Accept: 'application/octet-stream',
              'User-Agent': 'Mozilla/5.0',
            };
            if (GITHUB_TOKEN) {
              assetHeaders['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
            }

            // GitHub API trả về 302 chuyển hướng sang S3 ký sẵn
            const assetResp = await fetch(matchedAsset.url, {
              headers: assetHeaders,
              redirect: 'manual',
              cache: 'no-store',
            });

            if (assetResp.status === 302 || assetResp.status === 301) {
              const signedS3Url = assetResp.headers.get('location');
              if (signedS3Url) {
                const s3Headers: Record<string, string> = {
                  'User-Agent': 'Mozilla/5.0',
                };
                if (rangeHeader) {
                  s3Headers['Range'] = rangeHeader;
                }
                upstream = await fetch(signedS3Url, {
                  headers: s3Headers,
                  redirect: 'follow',
                  cache: 'no-store',
                });
              }
            } else if (assetResp.ok || assetResp.status === 206) {
              upstream = assetResp;
            }
          }
        }
      } catch (e) {
        console.warn('Lỗi tra cứu Release Asset API:', e);
      }
    }

    // BƯỚC 3: Nếu cả 2 cách trên không lấy được stream server-side, chuyển hướng 307 cho trình duyệt tự tải
    if (!upstream || (!upstream.ok && upstream.status !== 206)) {
      if (targetUrl && targetUrl.startsWith('https://')) {
        return NextResponse.redirect(targetUrl, 307);
      }
      return NextResponse.json(
        { error: 'Không tìm thấy file nhạc trên CDN hoặc Release storage.' },
        { status: upstream ? upstream.status : 404 }
      );
    }

    const mimeType = getMimeType(inferredFile || targetUrl);
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', mimeType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
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
    if (targetUrl && targetUrl.startsWith('https://')) {
      return NextResponse.redirect(targetUrl, 307);
    }
    return NextResponse.json({ error: 'Lỗi truyền tải âm thanh.' }, { status: 500 });
  }
}
