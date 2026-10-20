import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';
const GITHUB_RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

function extractFilename(urlOrPath?: string): string {
  if (!urlOrPath) return '';
  const match = urlOrPath.match(/file=([^&]+)/);
  if (match) return decodeURIComponent(match[1]).trim();
  const parts = urlOrPath.split('/');
  return decodeURIComponent(parts[parts.length - 1] || '').trim();
}

function isSameTrack(t: any, targetId?: string, targetTitle?: string, targetFile?: string): boolean {
  if (!t) return false;
  if (targetId && t.id === targetId) return true;
  if (targetTitle && t.title && t.title.trim().toLowerCase() === targetTitle.trim().toLowerCase()) {
    return true;
  }
  if (targetFile) {
    const tFile = extractFilename(t.streamUrl || t.cdnUrl);
    if (tFile && tFile.toLowerCase() === targetFile.toLowerCase()) return true;
  }
  return false;
}

async function deleteReleaseAsset(filename: string): Promise<void> {
  if (!GITHUB_TOKEN || !filename) return;
  try {
    const relRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
      }
    );
    if (!relRes.ok) return;
    const relData = await relRes.json();
    const assets: any[] = relData.assets || [];

    const clean = filename.toLowerCase();
    const targetAsset = assets.find(
      (a) => a.name && (a.name.toLowerCase() === clean || clean.includes(a.name.toLowerCase()))
    );
    if (!targetAsset) return;

    await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${targetAsset.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
      }
    );
  } catch {}
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, title, streamUrl } = body;

    if (!id && !title && !streamUrl) {
      return NextResponse.json({ error: 'Thiếu thông tin bài hát cần xóa.' }, { status: 400 });
    }

    const targetFile = extractFilename(streamUrl);

    // 1. Xóa khỏi file local data/catalog.json (nếu đang ở localhost)
    let localRemaining: any[] | null = null;
    try {
      const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
      const catalog = JSON.parse(raw);
      if (Array.isArray(catalog)) {
        localRemaining = catalog.filter((t: any) => !isSameTrack(t, id, title, targetFile));
        await fs.writeFile(CATALOG_PATH, JSON.stringify(localRemaining, null, 2), 'utf-8');
      }
    } catch {}

    // 2. Xóa khỏi GitHub Repository data/catalog.json
    if (GITHUB_TOKEN) {
      try {
        const contentUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`;
        const getRes = await fetch(contentUrl, {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
          },
          cache: 'no-store',
        });

        if (getRes.ok) {
          const data = await getRes.json();
          const sha = data.sha;
          const rawJson = Buffer.from(data.content, 'base64').toString('utf-8');
          const ghCatalog: any[] = JSON.parse(rawJson);

          const ghRemaining = Array.isArray(ghCatalog)
            ? ghCatalog.filter((t: any) => !isSameTrack(t, id, title, targetFile))
            : [];

          const finalToSave = localRemaining !== null && ghRemaining.length === 0 && localRemaining.length > 0
            ? localRemaining
            : ghRemaining;

          const updatedBase64 = Buffer.from(JSON.stringify(finalToSave, null, 2), 'utf-8').toString('base64');

          await fetch(contentUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `feat: delete track ${title || id} from catalog`,
              content: updatedBase64,
              sha,
            }),
            cache: 'no-store',
          });
        } else if (getRes.status === 404 && localRemaining !== null) {
          // Khởi tạo file trên GitHub nếu chưa có
          const updatedBase64 = Buffer.from(JSON.stringify(localRemaining, null, 2), 'utf-8').toString('base64');
          await fetch(contentUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: `feat: sync catalog after deleting ${title || id}`,
              content: updatedBase64,
            }),
            cache: 'no-store',
          });
        }
      } catch (e) {
        console.warn('GitHub catalog delete sync warning:', e);
      }
    }

    // 3. Xóa asset vật lý trên GitHub Release tracks-v1
    if (targetFile) {
      await deleteReleaseAsset(targetFile);
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa bài hát thành công.',
    });
  } catch (err: any) {
    if (err?.digest) throw err;
    console.error('Lỗi Delete API:', err);
    return NextResponse.json({ error: err.message || 'Lỗi xử lý xóa bài hát.' }, { status: 500 });
  }
}
