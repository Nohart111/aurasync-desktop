import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  await connection();

  try {
    const body = await req.json();
    const { id, fileName, streamUrl, title } = body;

    const owner = process.env.GITHUB_OWNER || 'Nohart111';
    const repo = process.env.GITHUB_REPO || 'aurasound-music-data';
    const tag = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';
    const token = process.env.GITHUB_TOKEN;

    // 1. Xóa khỏi file data/catalog.json cục bộ
    const catalogPath = path.join(process.cwd(), 'data', 'catalog.json');
    try {
      if (fs.existsSync(catalogPath)) {
        const raw = fs.readFileSync(catalogPath, 'utf8');
        let catalog: any[] = JSON.parse(raw);
        if (Array.isArray(catalog)) {
          catalog = catalog.filter((item) => {
            if (id && String(item.id) === String(id)) return false;
            if (fileName && item.fileName === fileName) return false;
            if (title && item.title === title) return false;
            return true;
          });
          fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
        }
      }
    } catch (err) {
      console.warn('Local catalog delete notice:', err);
    }

    // 2. Xóa file vật lý trên GitHub Release CDN (tracks-v1)
    if (token) {
      try {
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
          const assets: any[] = relData.assets || [];

          const targetAsset = assets.find((a) => {
            if (id && String(a.id) === String(id)) return true;
            if (fileName && a.name === fileName) return true;
            if (streamUrl && (streamUrl.includes(a.name) || streamUrl.includes(encodeURIComponent(a.name)))) {
              return true;
            }
            return false;
          });

          if (targetAsset && targetAsset.id) {
            await fetch(
              `https://api.github.com/repos/${owner}/${repo}/releases/assets/${targetAsset.id}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'User-Agent': 'AuraSound-App',
                },
              }
            );
          }
        }
      } catch (ghErr) {
        console.warn('GitHub asset delete notice:', ghErr);
      }
    }

    return NextResponse.json({ status: 'deleted', id });
  } catch (err) {
    console.error('Delete track error:', err);
    return NextResponse.json({ error: 'Không thể xóa bài hát' }, { status: 500 });
  }
}
