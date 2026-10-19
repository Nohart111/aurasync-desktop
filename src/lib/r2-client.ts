// src/lib/r2-client.ts
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Track } from "@/core/algorithms/DoublyLinkedQueue";

function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured.");
  return bucket;
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export interface CatalogTrack extends Track {
  isCachedOnR2: true;
}

export function getR2ObjectUrl(key: string): string {
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicUrl) return `${publicUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return `/api/stream?key=${encodeURIComponent(key)}`;
}

export async function checkFileExistsOnR2(key: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({ Bucket: getBucketName(), Key: key })
    );
    return true;
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (typeof error === "object" && error !== null &&
        "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
    ) {
      return false;
    }
    throw error;
  }
}

export async function streamAudioToR2(
  key: string,
  bodyStream: ReadableStream<Uint8Array> | Buffer | Uint8Array,
  contentType = "audio/mpeg"
): Promise<string> {
  const upload = new Upload({
    client: r2Client,
    params: {
      Bucket: getBucketName(),
      Key: key,
      Body: bodyStream,
      ContentType: contentType,
    },
    queueSize: 3,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  });

  await upload.done();
  return getR2ObjectUrl(key);
}

export async function getR2Catalog(): Promise<CatalogTrack[]> {
  try {
    const response = await r2Client.send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: "catalog/tracks.json" })
    );
    const json = await response.Body?.transformToString();
    if (!json) return [];
    const tracks = JSON.parse(json) as Track[];
    return tracks.map((track) => ({
      ...track,
      streamUrl: getR2ObjectUrl(track.r2Key || `tracks/${track.id}.mp3`),
      isCachedOnR2: true as const,
    }));
  } catch (error) {
    if (
      error instanceof NoSuchKey ||
      (typeof error === "object" && error !== null &&
        "$metadata" in error &&
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
    ) {
      return [];
    }
    throw error;
  }
}

export async function appendTrackToR2Catalog(track: Track): Promise<void> {
  const bucket = getBucketName();
  let tracks: Track[] = [];

  try {
    const response = await r2Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: "catalog/tracks.json" })
    );
    const json = await response.Body?.transformToString();
    if (json) tracks = JSON.parse(json) as Track[];
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    if (!(error instanceof NoSuchKey) && status !== 404) throw error;
  }

  if (!tracks.some((item) => item.id === track.id)) tracks.push(track);
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "catalog/tracks.json",
      Body: JSON.stringify(tracks),
      ContentType: "application/json; charset=utf-8",
    })
  );
}

export async function createAudioUploadUrl(
  fileKey: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: `tracks/${fileKey}`,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 900 });
}
