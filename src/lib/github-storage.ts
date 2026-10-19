// src/lib/github-storage.ts
interface GitHubReleaseResponse {
  id: number;
  upload_url: string;
  assets: Array<{ id: number; name: string; browser_download_url: string }>;
}

export async function uploadTrackToGitHubRelease(
  fileBuffer: Buffer,
  fileName: string,
  contentType = "audio/mpeg"
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "Nohart111";
  const repo = process.env.GITHUB_REPO || "aurasound-music-data";
  const tag = process.env.GITHUB_RELEASE_TAG || "tracks-v1";

  if (!token) throw new Error("Chưa cấu hình GITHUB_TOKEN trong file .env.local");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "AuraSound-App",
  };

  const releaseRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
    { headers, cache: "no-store" }
  );
  if (!releaseRes.ok) {
    throw new Error(`Không tìm thấy Release '${tag}' trên repo ${owner}/${repo}`);
  }
  const release: GitHubReleaseResponse = await releaseRes.json();

  const existing = release.assets.find((a) => a.name === fileName);
  if (existing) {
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/assets/${existing.id}`,
      { method: "DELETE", headers }
    );
  }

  const uploadUrl = release.upload_url.split("{")[0];
  const uploadRes = await fetch(`${uploadUrl}?name=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Content-Length": fileBuffer.byteLength.toString(),
    },
    body: new Uint8Array(fileBuffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Upload lên GitHub thất bại: ${errText}`);
  }

  const data = await uploadRes.json();
  return data.browser_download_url;
}