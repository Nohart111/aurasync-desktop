import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Thiếu tham số url", { status: 400 });
  }

  try {
    const range = req.headers.get("range");
    const headers: Record<string, string> = {};
    if (range) headers["Range"] = range;

    const response = await fetch(url, { headers });

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", response.headers.get("Content-Type") || "audio/mpeg");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    if (response.headers.get("Content-Range")) {
      responseHeaders.set("Content-Range", response.headers.get("Content-Range")!);
    }
    if (response.headers.get("Content-Length")) {
      responseHeaders.set("Content-Length", response.headers.get("Content-Length")!);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return new NextResponse("Lỗi stream audio", { status: 500 });
  }
}
