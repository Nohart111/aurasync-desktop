// src/app/api/tracks/stream/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const range = req.headers.get("range");
  const upstreamHeaders: HeadersInit = {
    "User-Agent": "AuraSound-Streaming-Engine",
  };
  if (range) {
    upstreamHeaders["Range"] = range;
  }

  const upstreamRes = await fetch(targetUrl, {
    headers: upstreamHeaders,
    redirect: "follow",
  });

  if (!upstreamRes.ok && upstreamRes.status !== 206) {
    return new NextResponse("Upstream audio error", { status: upstreamRes.status });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", upstreamRes.headers.get("Content-Type") || "audio/mpeg");
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Access-Control-Allow-Origin", "*");

  const contentLength = upstreamRes.headers.get("Content-Length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = upstreamRes.headers.get("Content-Range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
}