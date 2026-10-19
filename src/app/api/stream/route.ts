import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { r2Client } from "@/lib/r2-client";

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
    "Accept-Ranges": "bytes",
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || !key.startsWith("tracks/") || key.includes("..")) {
    return NextResponse.json({ error: "A valid R2 track key is required." }, { status: 400, headers: corsHeaders() });
  }

  try {
    const range = request.headers.get("range") || undefined;
    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Range: range,
      })
    );
    const headers = corsHeaders();
    headers.set("Content-Type", object.ContentType || "audio/mpeg");
    if (object.ContentLength !== undefined) {
      headers.set("Content-Length", String(object.ContentLength));
    }
    if (object.ContentRange) headers.set("Content-Range", object.ContentRange);
    if (object.ETag) headers.set("ETag", object.ETag);

    return new NextResponse(object.Body?.transformToWebStream() ?? null, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "R2 stream request failed." },
      { status: status === 404 ? 404 : 502, headers: corsHeaders() }
    );
  }
}
