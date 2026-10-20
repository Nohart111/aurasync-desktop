import { NextResponse } from 'next/server';
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
const YTDLP_BIN_PATH = path.join(os.tmpdir(), process.platform === 'win32' ? 'aurasound-yt-dlp.exe' : 'aurasound-yt-dlp');

function cleanTrackMetadata(rawTitle: string, rawArtist?: string): { title: string; artist: string } {
  let title = rawTitle.replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();

  title = title
    .replace(/\[\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO\vert{}MV\vert{}AUDIO\vert{}LYRIC\vert{}HD\vert{}4K\vert{}VISUALIZER)\s*\]/gi, '')
    .replace(/\(\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO\vert{}MV\vert{}AUDIO\vert{}LYRICS?\vert{}HD\vert{}4K\vert{}VISUALIZER)\s*\)/gi, '')
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

    const res = await fetch(dlUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
      });
      const html = await res.text();
      const titleMatch = html.match(/<title>(.+?) - YouTube<\/title>/);
      const authorMatch = html.match(/"ownerChannelName":"([^"]+)"/);
      const lenMatch = html.match(/"lengthSeconds":"(\d+)"/);
      const durationSec = lenMatch ? parseInt(lenMatch[1], 10) : 240;

      const rawTitle = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") : `YouTube (${directId})`;
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

async function extractViaYtDlpRamPipe(ytUrl: string): Promise<Buffer | null> {
  const binPath = await ensureYtDlpBinary();
  if (!binPath) return null;

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn(
      binPath,
      [
        ytUrl,
        '-f',
        'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b',
        '--no-playlist',
        '--no-part',
        '--no-cache-dir',
        '--no-warnings',
        '--quiet',
        '-o',
        '-',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve(null);
    }, 45000);

    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    child.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && chunks.length > 0) {
        const fullBuffer = Buffer.concat(chunks);
        if (fullBuffer.length > 100000) {
          resolve(fullBuffer);
          return;
        }
      }
      resolve(null);
    });
  });
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
  if (!GITHUB_TOKEN) {
    console.error('Thiếu GITHUB_TOKEN trong .env');
    return null;
  }

  try {
    const releaseRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${GITHUB_RELEASE_TAG}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
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

async function dispatchGitHubActionsIngest(
  videoUrl: string,
  title: string,
  artist: string,
  thumbnail: string,
  duration: number
): Promise<boolean> {
  if (!GITHUB_TOKEN) return false;

  try {
    const workflowUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/ingest.yml/dispatches`;
    const res = await fetch(workflowUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          video_url: videoUrl,
          title,
          artist,
          thumbnail: thumbnail || '',
          duration: (duration || 240).toString(),
        },
      }),
    });

    return res.status === 204 || res.ok;
  } catch (err) {
    console.error('Lỗi gọi GitHub Actions Dispatch:', err);
    return false;
  }
}

export async function POST(req: Request) {
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
      const ytUrl = track.url || `https://www.youtube.com/watch?v=${track.videoId}`;

      const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

      if (isVercel) {
        const dispatched = await dispatchGitHubActionsIngest(
          ytUrl,
          clean.title,
          clean.artist,
          track.thumbnail,
          track.duration
        );

        if (dispatched) {
          const cloudTrack = {
            id: `trk-cloud-${Date.now()}`,
            title: clean.title,
            artist: clean.artist,
            duration: track.duration || 240,
            album: 'Cloud Vault',
            genre: 'Stereo',
            bitrate: '256 kbps',
            format: 'm4a',
            coverUrl: track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
            streamUrl: '',
            dateAdded: new Date().toISOString(),
          };

          return NextResponse.json({
            success: true,
            isCloudQueued: true,
            message: `Đang kích hoạt máy ảo GitHub nạp bài "${clean.title}"... Bài hát sẽ xuất hiện trong giây lát!`,
            track: cloudTrack,
          });
        }
      }

      const audioBuffer = await extractViaYtDlpRamPipe(ytUrl);
      if (!audioBuffer) {
        const dispatched = await dispatchGitHubActionsIngest(
          ytUrl,
          clean.title,
          clean.artist,
          track.thumbnail,
          track.duration
        );
        if (dispatched) {
          return NextResponse.json({
            success: true,
            isCloudQueued: true,
            message: `Đang xử lý nạp bài "${clean.title}" qua GitHub Actions...`,
            track: {
              id: `trk-cloud-${Date.now()}`,
              title: clean.title,
              artist: clean.artist,
              duration: track.duration || 240,
              coverUrl: track.thumbnail,
            },
          });
        }
        return NextResponse.json(
          { error: 'Không thể trích xuất luồng âm thanh của video này.' },
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

      let catalog: any[] = [];
      try {
        const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
        catalog = JSON.parse(raw);
      } catch {
        catalog = [];
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
        coverUrl: track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
        streamUrl: `/api/tracks/stream?file=${encodeURIComponent(uploaded.safeName)}`,
        cdnUrl: uploaded.browserDownloadUrl,
        dateAdded: new Date().toISOString(),
      };

      const updatedCatalog = [newTrack, ...catalog.filter((t: any) => t.id !== newTrack.id)];
      await fs.writeFile(CATALOG_PATH, JSON.stringify(updatedCatalog, null, 2), 'utf-8');

      return NextResponse.json({
        success: true,
        track: newTrack,
      });
    }

    return NextResponse.json({ error: 'Yêu cầu không hợp lệ.' }, { status: 400 });
  } catch (error: any) {
    console.error('Lỗi Ingest API:', error);
    return NextResponse.json({ error: error.message || 'Lỗi máy chủ.' }, { status: 500 });
  }
}
