// src/app/api/stream/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return new NextResponse("Missing audio URL", { status: 400 });
  }

  try {
    const range = req.headers.get("range");
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Referer: "https://www.nhaccuatui.com/",
    };

    if (range) {
      headers["Range"] = range;
    }

    const response = await fetch(targetUrl, { headers });

    // Truyền tiếp phản hồi âm thanh kèm header CORS mở
    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type");
    responseHeaders.set("Accept-Ranges", "bytes");

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    responseHeaders.set("Content-Type", contentType);

    const contentLength = response.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = response.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new NextResponse(`Proxy error: ${err.message}`, { status: 502 });
  }
}