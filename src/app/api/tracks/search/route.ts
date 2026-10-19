import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  // Tránh lỗi prerender trên Next.js 16 Turbopack
  await connection();

  const owner = process.env.GITHUB_OWNER || 'Nohart111';
  const repo = process.env.GITHUB_REPO || 'aurasound-music-data';
  const tag = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';
  const token = process.env.GITHUB_TOKEN;

  const catalogPath = path.join(process.cwd(), 'data', 'catalog.json');
  let localCatalog: any[] = [];
  try {
    if (fs.existsSync(catalogPath)) {
      const fileData = fs.readFileSync(catalogPath, 'utf8');
      localCatalog = JSON.parse(fileData);
      if (!Array.isArray(localCatalog)) localCatalog = [];
    }
  } catch (err) {
    console.error('Error reading catalog.json:', err);
  }

  try {
    const headers: HeadersInit = {
      'User-Agent': 'AuraSound-App',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Luôn lấy dữ liệu mới nhất từ GitHub không lưu cache
    const ghRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
      {
        headers,
        cache: 'no-store',
      }
    );

    if (ghRes.ok) {
      const releaseData = await ghRes.json();
      const assets: any[] = releaseData.assets || [];

      // Danh sách các file âm thanh THỰC SỰ ĐANG CÒN trên GitHub
      const activeAssetNames = new Set(assets.map((a: any) => a.name));
      const assetMap = new Map(assets.map((a: any) => [a.name, a]));

      const syncedTracks: any[] = [];

      // 1. Chỉ giữ lại những bài hát trong catalog mà file trên GitHub VẪN CÒN TỒN TẠI
      for (const item of localCatalog) {
        const itemFileName = item.fileName || path.basename(item.streamUrl || item.url || '');
        
        // Kiểm tra xem file có còn nằm trên GitHub không
        const isStillOnGithub = activeAssetNames.has(itemFileName) || assets.some((a) => {
          const rawUrl = item.streamUrl || item.url || '';
          return rawUrl.includes(encodeURIComponent(a.name)) || rawUrl.includes(a.name);
        });

        if (isStillOnGithub) {
          syncedTracks.push(item);
        }
      }

      // 2. Thêm các bài hát mới trên GitHub nếu chưa có trong catalog
      for (const asset of assets) {
        const isAudio = /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(asset.name);
        if (!isAudio) continue;

        const alreadyExists = syncedTracks.some((t) => {
          const tFile = t.fileName || path.basename(t.streamUrl || t.url || '');
          return tFile === asset.name || (t.streamUrl || t.url || '').includes(asset.name);
        });

        if (!alreadyExists) {
          const rawName = asset.name.replace(/\.[^/.]+$/, '');
          const parts = rawName.split(' - ');
          const artist = parts.length > 1 ? parts[0].trim() : 'Nghệ sĩ chưa rõ';
          const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rawName.trim();

          syncedTracks.push({
            id: String(asset.id || asset.name),
            title,
            artist,
            duration: 180,
            fileName: asset.name,
            streamUrl: asset.browser_download_url,
            url: asset.browser_download_url,
          });
        }
      }

      // 3. Tự động cập nhật dọn sạch file data/catalog.json trên máy
      try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(catalogPath, JSON.stringify(syncedTracks, null, 2), 'utf8');
      } catch (e) {
        console.error('Failed to sync catalog.json:', e);
      }

      return NextResponse.json(
        { tracks: syncedTracks },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        }
      );
    }
  } catch (err) {
    console.error('Error syncing with GitHub releases:', err);
  }

  // Fallback nếu mất mạng
  return NextResponse.json(
    { tracks: localCatalog },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
