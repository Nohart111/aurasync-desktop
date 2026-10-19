import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const title = (formData.get("title") as string) || "Bài hát mới";
    const artist = (formData.get("artist") as string) || "Nghệ sĩ chưa rõ";
    const duration = Number(formData.get("duration")) || 180;

    if (!file) {
      return NextResponse.json({ error: "Không tìm thấy file tải lên" }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || "Nohart111";
    const repo = process.env.GITHUB_REPO || "aurasound-music-data";
    const tag = process.env.GITHUB_RELEASE_TAG || "tracks-v1";

    if (!token) {
      return NextResponse.json(
        { error: "Chưa nạp GITHUB_TOKEN trong .env.local" },
        { status: 500 }
      );
    }

    // 1. Lấy upload_url từ GitHub Release kèm User-Agent
    const releaseRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "AuraSound-App",
        },
      }
    );

    if (!releaseRes.ok) {
      const errText = await releaseRes.text();
      return NextResponse.json(
        { error: `GitHub từ chối release: ${errText}` },
        { status: 500 }
      );
    }

    const releaseData = await releaseRes.json();
    const uploadUrl = releaseData.upload_url.replace(/\{(\?.*)?\}/, "");

    const cleanFileName = `${Date.now()}_${encodeURIComponent(file.name.replace(/[^a-zA-Z0-9._-]/g, "_"))}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // 2. Upload file nhị phân vào Release Asset
    const uploadRes = await fetch(`${uploadUrl}?name=${cleanFileName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "audio/mpeg",
        "Content-Length": fileBuffer.length.toString(),
        "User-Agent": "AuraSound-App",
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errUpload = await uploadRes.text();
      return NextResponse.json(
        { error: `Lỗi đẩy file lên GitHub: ${errUpload}` },
        { status: 500 }
      );
    }

    const assetData = await uploadRes.json();
    const streamUrl = assetData.browser_download_url;

    // 3. Lưu vào catalog.json cục bộ
    const catalogDir = path.join(process.cwd(), "data");
    const catalogPath = path.join(catalogDir, "catalog.json");

    if (!fs.existsSync(catalogDir)) {
      fs.mkdirSync(catalogDir, { recursive: true });
    }

    let catalog = [];
    if (fs.existsSync(catalogPath)) {
      try {
        catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
      } catch {
        catalog = [];
      }
    }

    const newTrack = {
      id: String(assetData.id || Date.now()),
      title: title,
      artist: artist,
      album: "Lossless Single",
      duration: duration,
      bpm: 120,
      streamUrl: streamUrl,
      coverUrl: "",
      dominantColors: ["#8A2BE2", "#00F0FF"],
    };

    catalog.unshift(newTrack);
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf-8");

    return NextResponse.json({ success: true, track: newTrack });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Lỗi máy chủ nội bộ" },
      { status: 500 }
    );
  }
}
