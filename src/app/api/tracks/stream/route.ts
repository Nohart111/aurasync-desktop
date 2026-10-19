import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  const range = req.headers.get('range');

  try {
    // 1. Xử lý 302 Redirect của GitHub thủ công để không bị nuốt mất header Range
    let targetUrl = url;
    const initialRes = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AuraSound-App',
        ...(range ? { Range: range } : {}),
      },
      redirect: 'manual',
    });

    if (initialRes.status === 301 || initialRes.status === 302) {
      const redirectLocation = initialRes.headers.get('location');
      if (redirectLocation) {
        targetUrl = redirectLocation;
      }
    }

    // 2. Tải luồng âm thanh thực tế với Range được chuyển tiếp
    const streamHeaders: HeadersInit = {
      'User-Agent': 'AuraSound-App',
    };
    if (range) {
      streamHeaders['Range'] = range;
    }

    const mediaRes = await fetch(targetUrl, {
      method: 'GET',
      headers: streamHeaders,
    });

    // 3. Trả về cho trình duyệt kèm mã 206 Partial Content để kích hoạt tua nhạc
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', mediaRes.headers.get('content-type') || 'audio/mpeg');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const contentLength = mediaRes.headers.get('content-length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    const contentRange = mediaRes.headers.get('content-range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    return new NextResponse(mediaRes.body, {
      status: mediaRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Audio stream proxy error:', err);
    return new NextResponse('Error streaming audio', { status: 500 });
  }
}
