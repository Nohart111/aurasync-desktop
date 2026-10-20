import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';
const GITHUB_RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

function cleanTrackMetadata(rawTitle: string): { title: string; artist: string } {
  let title = rawTitle.replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();

  title = title
    .replace(/\[\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO\vert{}MV\vert{}AUDIO\vert{}LYRIC\vert{}HD\vert{}4K\vert{}VISUALIZER)\s*\]/gi, '')
    .replace(/\(\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO\vert{}MV\vert{}AUDIO\vert{}LYRICS?\vert{}HD\vert{}4K\vert{}VISUALIZER)\s*\)/gi, '')
    .replace(/\|\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO|MV|AUDIO|LYRICS?)\s*$/gi, '')
    .replace(/-\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO|MV|AUDIO|LYRICS?)\s*$/gi, '')
    .replace(/\b(?:OFFICIAL\s+MV|OFFICIAL\s+MUSIC\s+VIDEO|OFFICIAL\s+VIDEO)\b/gi, '')
    .trim();

  let artist = 'Nghệ sĩ chưa rõ';

  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  } else if (title.includes(' | ')) {
    const parts = title.split(' | ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' | ').trim();
    }
  }

  title = title.replace(/[-_.\s]+$/, '').trim();
  artist = artist.replace(/[-_.\s]+$/, '').trim();

  if (/^[a-z0-9]+(-[a-z0-9]+)+$/i.test(title)) {
    title = title
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return {
    title: title || 'Track',
    artist: artist || 'Nghệ sĩ chưa rõ',
  };
}

function slugify(text: string): string {
  return (
    text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'track'
  );
}

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.wav')) return 'audio/wav';
  return 'audio/mpeg';
}

function getExt(filename: string): string {
  const m = filename.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'mp3';
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file tải lên.' }, { status: 400 });
    }

    const clean = cleanTrackMetadata(file.name);
    const ext = getExt(file.name);
    const mime = getMimeType(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = `${slugify(clean.title)}-${Date.now()}.${ext}`;

    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: 'Chưa cấu hình GITHUB_TOKEN.' }, { status: 500 });
    }

    const releaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!releaseRes.ok) {
      return NextResponse.json({ error: 'Không tìm thấy Release tracks-v1 trên GitHub.' }, { status: 502 });
    }

    const releaseData = await releaseRes.json();
    const releaseId = releaseData.id;

    const uploadUrl = `https://uploads.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(
      safeName
    )}`;

    const upRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': mime,
        'Content-Length': buffer.length.toString(),
      },
      body: new Uint8Array(buffer),
    });

    if (!upRes.ok) {
      return NextResponse.json({ error: 'Không thể upload file lên GitHub Release.' }, { status: 502 });
    }

    const upData = await upRes.json();

    let catalog: any[] = [];
    try {
      const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
      catalog = JSON.parse(raw);
    } catch {
      catalog = [];
    }

    const newTrack = {
      id: `trk-upload-${Date.now()}`,
      title: clean.title,
      artist: clean.artist,
      duration: 240,
      album: 'Local Upload',
      genre: 'Stereo',
      bitrate: '320 kbps',
      format: ext,
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      streamUrl: `/api/tracks/stream?file=${encodeURIComponent(safeName)}`,
      cdnUrl: upData.browser_download_url,
      dateAdded: new Date().toISOString(),
    };

    const updatedCatalog = [newTrack, ...catalog.filter((t: any) => t.id !== newTrack.id)];
    await fs.writeFile(CATALOG_PATH, JSON.stringify(updatedCatalog, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      track: newTrack,
    });
  } catch (err: any) {
    console.error('Lỗi upload file:', err);
    return NextResponse.json({ error: err.message || 'Lỗi xử lý file.' }, { status: 500 });
  }
}
