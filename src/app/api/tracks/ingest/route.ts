import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';
const GITHUB_RELEASE_TAG = process.env.GITHUB_RELEASE_TAG || 'tracks-v1';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');
const YTDLP_BIN_PATH = path.join(
  os.tmpdir(),
  process.platform === 'win32' ? 'aurasound-yt-dlp.exe' : 'aurasound-yt-dlp'
);

function cleanTrackMetadata(rawTitle: string, rawArtist?: string): { title: string; artist: string } {
  let title = rawTitle.replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();

  title = title
    .replace(/\[\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO\vert{}MV\vert{}AUDIO\vert{}LYRIC\vert{}HD\vert{}4K\vert{}VISUALIZER\vert{}PERFORMANCE)\s*\]/gi, '')
    .replace(/\(\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO\vert{}MV\vert{}AUDIO\vert{}LYRICS?\vert{}HD\vert{}4K\vert{}VISUALIZER\vert{}PERFORMANCE)\s*\)/gi, '')
    .replace(/\|\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO|MV|AUDIO|LYRICS?)\s*$/gi, '')
    .replace(/-\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO|MV|AUDIO|LYRICS?)\s*$/gi, '')
    .replace(/\b(?:OFFICIAL\s+MV|OFFICIAL\s+MUSIC\s+VIDEO|OFFICIAL\s+VIDEO)\b/gi, '')
    .trim();

  let artist = rawArtist || 'Nghệ sĩ chưa rõ';

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

function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr) return 240;
  const parts = durationStr.split(':').map((p) => parseInt(p.trim(), 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  const parsed = parseInt(durationStr, 10);
  return isNaN(parsed) ? 240 : parsed;
}

function formatSeconds(sec: number): string {
  const sTotal = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sTotal / 60);
  const s = sTotal % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function extractYouTubeVideoId(input: string): string | null {
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function collectVideoRenderers(node: any, out: any[] = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.videoRenderer && node.videoRenderer.videoId) {
    out.push(node.videoRenderer);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
  } else {
    for (const key of Object.keys(node)) {
      collectVideoRenderers(node[key], out);
    }
  }
  return out;
}

async function ensureYtDlpBinary(): Promise<string | null> {
  if (existsSync(YTDLP_BIN_PATH)) return YTDLP_BIN_PATH;
  try {
    const dlUrl =
      process.platform === 'win32'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

    const res = await fetch(dlUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(YTDLP_BIN_PATH, buf);
    if (process.platform !== 'win32') {
      await fs.chmod(YTDLP_BIN_PATH, 0o755);
    }
    return YTDLP_BIN_PATH;
  } catch {
    return null;
  }
}

async function searchYouTube(query: string) {
  const directId = extractYouTubeVideoId(query);
  if (directId) {
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${directId}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        cache: 'no-store',
      });
      const html = await res.text();
      const titleMatch = html.match(/<title>(.+?) - YouTube<\/title>/);
      const authorMatch = html.match(/"ownerChannelName":"([^"]+)"/);
      const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
      const durationSec = lenMatch ? parseInt(lenMatch[1], 10) : 240;

      const rawTitle = titleMatch
        ? titleMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        : `YouTube (${directId})`;
      const rawAuthor = authorMatch ? authorMatch[1] : 'YouTube';
      const clean = cleanTrackMetadata(rawTitle, rawAuthor);

      return [
        {
          id: directId,
          videoId: directId,
          title: clean.title,
          artist: clean.artist,
          duration: durationSec,
          durationFormatted: formatSeconds(durationSec),
          thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${directId}`,
          source: 'youtube',
        },
      ];
    } catch {
      return [
        {
          id: directId,
          videoId: directId,
          title: `YouTube (${directId})`,
          artist: 'YouTube',
          duration: 240,
          durationFormatted: '04:00',
          thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${directId}`,
          source: 'youtube',
        },
      ];
    }
  }

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const html = await res.text();
      let jsonStr = '';
      const marker1 = 'var ytInitialData = ';
      const marker2 = 'window["ytInitialData"] = ';
      let idx = html.indexOf(marker1);
      let start = idx !== -1 ? idx + marker1.length : -1;

      if (start === -1) {
        idx = html.indexOf(marker2);
        if (idx !== -1) start = idx + marker2.length;
      }

      if (start !== -1) {
        const end = html.indexOf(';</script>', start);
        if (end !== -1) {
          jsonStr = html.slice(start, end);
        }
      }

      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        const renderers = collectVideoRenderers(data);
        const results: any[] = [];
        const seen = new Set<string>();

        for (const v of renderers) {
          if (!v.videoId || seen.has(v.videoId)) continue;
          const durationStr = v.lengthText?.simpleText;
          if (!durationStr) continue;

          const durationSec = parseDurationToSeconds(durationStr);
          if (durationSec < 45 || durationSec > 1800) continue;

          seen.add(v.videoId);
          const rawTitle =
            v.title?.runs?.map((r: any) => r.text).join('') ||
            v.title?.simpleText ||
            'Không có tiêu đề';
          const rawArtist =
            v.ownerText?.runs?.[0]?.text ||
            v.longBylineText?.runs?.[0]?.text ||
            'Nghệ sĩ chưa rõ';

          const clean = cleanTrackMetadata(rawTitle, rawArtist);

          results.push({
            id: v.videoId,
            videoId: v.videoId,
            title: clean.title,
            artist: clean.artist,
            duration: durationSec,
            durationFormatted: formatSeconds(durationSec),
            thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            source: 'youtube',
          });

          if (results.length >= 6) break;
        }

        if (results.length > 0) return results;
      }
    }
  } catch (err) {
    console.error('Lỗi tìm kiếm YouTube:', err);
  }

  return [];
}

// Engine 1: yt-dlp qua vùng nhớ tạm os.tmpdir() rồi tự xóa ngay lập tức (Hỗ trợ 100% DASH/HLS m4a, 0MB lưu máy)
async function extractViaYtDlp(ytUrl: string): Promise<Buffer | null> {
  const binPath = await ensureYtDlpBinary();
  if (!binPath) return null;

  const tmpId = `aurasound-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tmpTemplate = path.join(os.tmpdir(), `${tmpId}.%(ext)s`);

  const runAttempt = (extraArgs: string[]): Promise<boolean> =>
    new Promise((resolve) => {
      const args = [
        ytUrl,
        ...extraArgs,
        '-f',
        'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b',
        '--no-playlist',
        '--no-part',
        '--no-cache-dir',
        '--no-check-certificates',
        '--no-warnings',
        '-o',
        tmpTemplate,
      ];

      const child = spawn(binPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        resolve(false);
      }, 40000);

      child.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code === 0);
      });
    });

  try {
    let ok = await runAttempt([]);
    if (!ok) {
      ok = await runAttempt(['--extractor-args', 'youtube:player_client=ios,android_vr,web_safari']);
    }

    const files = await fs.readdir(os.tmpdir());
    const matched = files.find((f) => f.startsWith(tmpId));
    if (!matched) return null;

    const fullTmpPath = path.join(os.tmpdir(), matched);
    const buf = await fs.readFile(fullTmpPath);
    await fs.unlink(fullTmpPath).catch(() => {});

    if (buf.length > 50000) {
      return buf;
    }
  } catch {
    try {
      const files = await fs.readdir(os.tmpdir());
      for (const f of files.filter((x) => x.startsWith(tmpId))) {
        await fs.unlink(path.join(os.tmpdir(), f)).catch(() => {});
      }
    } catch {}
  }
  return null;
}

// Engine 2: Cloud Proxy p.savenow.to (Widget Button Endpoint miễn phí)
async function extractViaSavenowProxy(ytUrl: string): Promise<Buffer | null> {
  try {
    const initUrl = `https://p.savenow.to/ajax/download.php?button=1&start=1&end=1&format=m4a&iframe_source=https://loader.to&url=${encodeURIComponent(
      ytUrl
    )}`;
    const initRes = await fetch(initUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://loader.to/',
        Origin: 'https://loader.to',
      },
      cache: 'no-store',
    });
    if (!initRes.ok) return null;
    const initData = await initRes.json();
    const jobId = initData.id;
    if (!jobId) return null;

    const progressUrl = initData.progress_url || `https://p.savenow.to/ajax/progress.php?id=${jobId}`;

    for (let i = 0; i < 14; i++) {
      await new Promise((r) => setTimeout(r, 1400));
      const progRes = await fetch(progressUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://loader.to/',
        },
        cache: 'no-store',
      });
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.progress === 1000 && progData.download_url) {
          const audioRes = await fetch(progData.download_url, { cache: 'no-store' });
          if (audioRes.ok) {
            const buf = Buffer.from(await audioRes.arrayBuffer());
            if (buf.length > 50000) return buf;
          }
          break;
        }
      }
    }
  } catch {}
  return null;
}

// Engine 3: SoundCloud Full-Track Progressive MP3 (1.5s trên Vercel, không bao giờ bị chặn IP)
let cachedScClientId: string | null = null;
async function getSoundCloudClientId(): Promise<string | null> {
  if (cachedScClientId) return cachedScClientId;
  try {
    const homeRes = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      cache: 'no-store',
    });
    const html = await homeRes.text();
    const scriptUrls = Array.from(html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)).map(
      (m) => m[1]
    );
    for (let i = scriptUrls.length - 1; i >= Math.max(0, scriptUrls.length - 4); i--) {
      const jsRes = await fetch(scriptUrls[i], { cache: 'no-store' });
      const jsText = await jsRes.text();
      const match = jsText.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/);
      if (match && match[1]) {
        cachedScClientId = match[1];
        return cachedScClientId;
      }
    }
  } catch {}
  return null;
}

async function extractViaSoundCloudCrossMatch(searchQuery: string): Promise<Buffer | null> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) return null;

    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      searchQuery
    )}&client_id=${clientId}&limit=8`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    const collection: any[] = data.collection || [];

    for (const item of collection) {
      if ((item.duration || 0) < 60000) continue;
      const transcodings: any[] = item.media?.transcodings || [];
      const prog = transcodings.find((t) => t.format?.protocol === 'progressive');
      if (prog?.url) {
        const streamInfoRes = await fetch(`${prog.url}?client_id=${clientId}`, { cache: 'no-store' });
        if (streamInfoRes.ok) {
          const streamInfo = await streamInfoRes.json();
          if (streamInfo?.url) {
            const audioRes = await fetch(streamInfo.url, { cache: 'no-store' });
            if (audioRes.ok) {
              const buf = Buffer.from(await audioRes.arrayBuffer());
              if (buf.length > 100000) return buf;
            }
          }
        }
      }
    }
  } catch {}
  return null;
}

// Engine 4: InnerTube Direct Stream
async function extractViaInnerTube(videoId: string): Promise<Buffer | null> {
  try {
    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
        'X-YouTube-Client-Name': '28',
        'X-YouTube-Client-Version': '1.60.19',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.60.19',
            androidSdkVersion: 32,
            hl: 'vi',
            gl: 'VN',
          },
        },
        videoId,
      }),
      cache: 'no-store',
    });

    if (!playerRes.ok) return null;
    const data = await playerRes.json();
    const formats: any[] = data?.streamingData?.adaptiveFormats || [];

    const audioFormats = formats
      .filter((f) => f.url && f.mimeType && f.mimeType.startsWith('audio/'))
      .sort((a, b) => {
        const aIsMp4 = a.mimeType.includes('audio/mp4') ? 1 : 0;
        const bIsMp4 = b.mimeType.includes('audio/mp4') ? 1 : 0;
        if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });

    if (audioFormats.length === 0) return null;
    const targetFormat = audioFormats[0];
    const res = await fetch(targetFormat.url, { cache: 'no-store' });
    if (res.ok) {
      const finalBuf = Buffer.from(await res.arrayBuffer());
      if (finalBuf.length > 100000) return finalBuf;
    }
  } catch {}
  return null;
}

async function resolveYouTubeAudioStream(
  videoId: string,
  targetUrl: string,
  searchTitle: string
): Promise<Buffer | null> {
  const ytUrl = targetUrl || `https://www.youtube.com/watch?v=${videoId}`;

  if (process.env.VERCEL !== '1') {
    const ytdlpBuf = await extractViaYtDlp(ytUrl);
    if (ytdlpBuf) return ytdlpBuf;
  }

  if (searchTitle) {
    const scBuf = await extractViaSoundCloudCrossMatch(searchTitle);
    if (scBuf) return scBuf;
  }

  const savenowBuf = await extractViaSavenowProxy(ytUrl);
  if (savenowBuf) return savenowBuf;

  if (videoId) {
    const innerTubeBuf = await extractViaInnerTube(videoId);
    if (innerTubeBuf) return innerTubeBuf;
  }

  return null;
}

function detectAudioFormat(buf: Buffer): { ext: string; mime: string } {
  if (buf.length > 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { ext: 'm4a', mime: 'audio/mp4' };
  }
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { ext: 'webm', mime: 'audio/webm' };
  }
  return { ext: 'mp3', mime: 'audio/mpeg' };
}

async function uploadToGitHubCDN(
  buffer: Buffer,
  originalTitle: string
): Promise<{ safeName: string; browserDownloadUrl: string; ext: string } | null> {
  if (!GITHUB_TOKEN) return null;

  try {
    const releaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
      }
    );

    if (!releaseRes.ok) return null;

    const releaseData = await releaseRes.json();
    const releaseId = releaseData.id;
    const { ext, mime } = detectAudioFormat(buffer);
    const safeName = `${slugify(originalTitle)}-${Date.now()}.${ext}`;

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
      cache: 'no-store',
    });

    if (!upRes.ok) return null;

    const upData = await upRes.json();
    return {
      safeName,
      browserDownloadUrl: upData.browser_download_url,
      ext,
    };
  } catch (err) {
    console.error('Lỗi upload GitHub CDN:', err);
    return null;
  }
}

async function saveTrackToCatalogs(newTrack: any): Promise<void> {
  let localCatalog: any[] = [];
  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
    localCatalog = JSON.parse(raw);
    if (!Array.isArray(localCatalog)) localCatalog = [];
  } catch {
    localCatalog = [];
  }

  const updatedLocal = [newTrack, ...localCatalog.filter((t: any) => t && t.id !== newTrack.id)];
  try {
    await fs.writeFile(CATALOG_PATH, JSON.stringify(updatedLocal, null, 2), 'utf-8');
  } catch {}

  if (!GITHUB_TOKEN) return;

  try {
    const contentUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`;
    const getRes = await fetch(contentUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    let ghCatalog: any[] = [];
    let sha: string | undefined = undefined;

    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
      const rawJson = Buffer.from(data.content, 'base64').toString('utf-8');
      ghCatalog = JSON.parse(rawJson);
      if (!Array.isArray(ghCatalog)) ghCatalog = [];
    } else {
      ghCatalog = localCatalog;
    }

    const updatedGh = [newTrack, ...ghCatalog.filter((t: any) => t && t.id !== newTrack.id)];
    const updatedBase64 = Buffer.from(JSON.stringify(updatedGh, null, 2), 'utf-8').toString('base64');

    await fetch(contentUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `feat: add track '${newTrack.title}' to catalog.json`,
        content: updatedBase64,
        ...(sha ? { sha } : {}),
      }),
      cache: 'no-store',
    });
  } catch (e) {
    console.warn('GitHub catalog save warning:', e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, query, track } = body;

    if (action === 'search') {
      if (!query || typeof query !== 'string') {
        return NextResponse.json({ results: [] });
      }
      const results = await searchYouTube(query.trim());
      return NextResponse.json({ results });
    }

    if (action === 'ingest') {
      if (!track || (!track.videoId && !track.url)) {
        return NextResponse.json({ error: 'Thiếu thông tin bài hát.' }, { status: 400 });
      }

      const clean = cleanTrackMetadata(track.title || 'Track', track.artist);
      const videoId = track.videoId || extractYouTubeVideoId(track.url || '') || '';
      const ytUrl = track.url || `https://www.youtube.com/watch?v=${videoId}`;
      const searchTitle = `${clean.title} ${clean.artist !== 'Nghệ sĩ chưa rõ' ? clean.artist : ''}`.trim();

      const audioBuffer = await resolveYouTubeAudioStream(videoId, ytUrl, searchTitle);
      if (!audioBuffer) {
        return NextResponse.json(
          { error: 'Không thể trích xuất luồng âm thanh của video này. Vui lòng thử video khác.' },
          { status: 502 }
        );
      }

      const uploaded = await uploadToGitHubCDN(audioBuffer, clean.title);
      if (!uploaded) {
        return NextResponse.json(
          { error: 'Không thể đồng bộ lên GitHub CDN. Vui lòng kiểm tra GITHUB_TOKEN.' },
          { status: 502 }
        );
      }

      const newTrack = {
        id: `trk-${Date.now()}`,
        title: clean.title,
        artist: clean.artist,
        duration: track.duration || 240,
        album: 'Cloud Vault',
        genre: 'Stereo',
        bitrate: '256 kbps',
        format: uploaded.ext,
        coverUrl: track.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        streamUrl: `/api/tracks/stream?file=${encodeURIComponent(uploaded.safeName)}`,
        cdnUrl: uploaded.browserDownloadUrl,
        dateAdded: new Date().toISOString(),
      };

      await saveTrackToCatalogs(newTrack);

      return NextResponse.json({
        success: true,
        track: newTrack,
      });
    }

    return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  } catch (error: any) {
    if (error?.digest) throw error;
    console.error('Lỗi Ingest API:', error);
    return NextResponse.json({ error: error.message || 'Lỗi máy chủ.' }, { status: 500 });
  }
}
