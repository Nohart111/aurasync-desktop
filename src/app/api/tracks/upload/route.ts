import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import fs from 'fs';
import path from 'path';

function toSafeAsciiFileName(rawName: string): string {
  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
  const base = rawName.replace(/\.[^/.]+$/, '');
  const cleanBase = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const finalBase = cleanBase || 'Audio_Track';
  return `${finalBase}_${Date.now().toString().slice(-5)}.${ext}`;
}

export async function POST(req: NextRequest) {
  await connection();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const durationParam = formData.get('duration');

    if (!file) {
      return NextResponse.json({ error: 'Không tìm thấy file âm thanh' }, { status: 400 });
    }

    const owner = process.env.GITHUB_OWNER || 'Nohart111';
    const repo = process.env.GITHUB_REPO || 'aurasound-music-data';
    const tag = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';
    const token = process.env.GITHUB_TOKEN;

    const originalName = file.name.replace(/\.[^/.]+$/, '');
    const parts = originalName.split(' - ');
    const artist = parts.length > 1 ? parts[0].trim() : 'Nghệ sĩ chưa rõ';
    const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : originalName.trim();
    const duration = durationParam ? Number(durationParam) || 180 : 180;

    const safeFileName = toSafeAsciiFileName(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let finalStreamUrl = '';

    if (token) {
      const relRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'AuraSound-App',
            Accept: 'application/vnd.github.v3+json',
          },
          cache: 'no-store',
        }
      );

      if (relRes.ok) {
        const relData = await relRes.json();
        const uploadUrlBase = relData.upload_url.replace(/\{\?name,label\}$/, '');
        const uploadUrl = `${uploadUrlBase}?name=${encodeURIComponent(safeFileName)}`;

        const upRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'AuraSound-App',
            'Content-Type': file.type || 'audio/mpeg',
            'Content-Length': String(buffer.byteLength),
          },
          body: buffer,
        });

        if (upRes.ok) {
          const upData = await upRes.json();
          finalStreamUrl = upData.browser_download_url || '';
        }
      }
    }

    if (!finalStreamUrl) {
      return NextResponse.json({ error: 'Không thể tải lên GitHub Release CDN' }, { status: 500 });
    }

    const newTrack = {
      id: `upload-${Date.now()}`,
      title,
      artist,
      album: 'Lossless Personal Vault',
      duration,
      bpm: 120,
      fileName: safeFileName,
      streamUrl: finalStreamUrl,
      url: finalStreamUrl,
      coverUrl: '',
      dominantColors: ['#00F0FF', '#7000FF'] as [string, string],
    };

    try {
      const dataDir = path.join(process.cwd(), 'data');
      const catalogPath = path.join(dataDir, 'catalog.json');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      let catalog: any[] = [];
      if (fs.existsSync(catalogPath)) {
        catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        if (!Array.isArray(catalog)) catalog = [];
      }
      catalog.unshift(newTrack);
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    } catch {}

    return NextResponse.json({ track: newTrack, status: 'uploaded' });
  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: 'Lỗi tải file lên hệ thống' }, { status: 500 });
  }
}
