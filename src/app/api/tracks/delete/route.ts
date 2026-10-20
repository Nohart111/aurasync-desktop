import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';
const GITHUB_RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

async function deleteReleaseAsset(filename: string): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;
  try {
    const relRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!relRes.ok) return false;
    const relData = await relRes.json();
    const assets: any[] = relData.assets || [];

    const clean = filename.toLowerCase();
    const targetAsset = assets.find((a) => a.name && (a.name.toLowerCase() === clean || clean.includes(a.name.toLowerCase())));
    if (!targetAsset) return false;

    const delRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${targetAsset.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    return delRes.status === 204 || delRes.ok;
  } catch {
    return false;
  }
}

async function deleteFromGitHubCatalog(trackId: string): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;
  try {
    const contentUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`;
    const getRes = await fetch(contentUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!getRes.ok) return false;
    const data = await getRes.json();
    const sha = data.sha;
    const rawJson = Buffer.from(data.content, 'base64').toString('utf-8');
    const catalog: any[] = JSON.parse(rawJson);

    const updated = catalog.filter((t) => t.id !== trackId);
    const updatedBase64 = Buffer.from(JSON.stringify(updated, null, 2), 'utf-8').toString('base64');

    const putRes = await fetch(contentUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `feat: delete track ${trackId} from catalog`,
        content: updatedBase64,
        sha,
      }),
    });

    return putRes.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { id, streamUrl } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Thiếu ID bài hát cần xóa.' }, { status: 400 });
    }

    let assetFilename = '';
    if (streamUrl) {
      const match = streamUrl.match(/file=([^&]+)/);
      if (match) {
        assetFilename = decodeURIComponent(match[1]);
      } else {
        assetFilename = streamUrl.split('/').pop() || '';
      }
    }

    if (assetFilename) {
      await deleteReleaseAsset(assetFilename);
    }

    await deleteFromGitHubCatalog(id);

    try {
      const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
      const catalog = JSON.parse(raw);
      const updated = catalog.filter((t: any) => t.id !== id);
      await fs.writeFile(CATALOG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    } catch {}

    return NextResponse.json({
      success: true,
      message: 'Đã xóa bài hát khỏi kho lưu trữ thành công.',
    });
  } catch (err: any) {
    console.error('Lỗi Delete API:', err);
    return NextResponse.json({ error: err.message || 'Lỗi xử lý xóa bài hát.' }, { status: 500 });
  }
}
