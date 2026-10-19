import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  // Báo cho Next.js 16 không chạy thử lúc build tĩnh
  try {
    await connection();
  } catch {}

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "Nohart111";
  const repo = process.env.GITHUB_REPO || "aurasound-music-data";
  const tag = process.env.GITHUB_RELEASE_TAG || "tracks-v1";

  const trackMap = new Map();

  // 1. Đọc metadata từ catalog.json cục bộ (nếu có)
  try {
    const catalogPath = path.join(process.cwd(), "data", "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, "utf-8");
      const localList = JSON.parse(raw);
      if (Array.isArray(localList)) {
        localList.forEach((t) => trackMap.set(t.id, t));
      }
    }
  } catch (err) {}

  // 2. Lấy danh sách bài hát từ GitHub Releases
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "AuraSound-App",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
      { headers, cache: "no-store" }
    );

    if (res.ok) {
      const releaseData = await res.json();
      const assets = releaseData.assets || [];

      assets.forEach((asset: any) => {
        const id = String(asset.id);
        const rawName = asset.name.replace(/^\d+_/, "").replace(/\.[^/.]+$/, "");
        const cleanTitle = decodeURIComponent(rawName).replace(/_/g, " ");

        if (!trackMap.has(id)) {
          trackMap.set(id, {
            id: id,
            title: cleanTitle || asset.name,
            artist: "Lossless Audio",
            album: "GitHub CDN",
            duration: 180,
            bpm: 120,
            streamUrl: asset.browser_download_url,
            coverUrl: "",
            dominantColors: ["#8A2BE2", "#00F0FF"],
          });
        }
      });
    }
  } catch (err) {}

  const tracks = Array.from(trackMap.values());
  return NextResponse.json({ tracks });
}
