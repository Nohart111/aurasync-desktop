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
      .slice(0, 60) || 'track'
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

      return [
        {
          id: directId,
          videoId: directId,
          title: titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") : `YouTube (${directId})`,
          artist: authorMatch ? authorMatch[1] : 'YouTube',
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
          const title =
            v.title?.runs?.map((r: any) => r.text).join('') ||
            v.title?.simpleText ||
            'Không có tiêu đề';
          const artist =
            v.ownerText?.runs?.[0]?.text ||
            v.longBylineText?.runs?.[0]?.text ||
            'Nghệ sĩ chưa rõ';

          results.push({
            id: v.videoId,
            videoId: v.videoId,
            title,
            artist,
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
    const contentLength = parseInt(targetFormat.contentLength || '0', 10);

    if (contentLength > 0 && contentLength < 50 * 1024 * 1024) {
      const chunkSize = 2 * 1024 * 1024;
      const ranges: { start: number; end: number }[] = [];
      for (let start = 0; start < contentLength; start += chunkSize) {
        ranges.push({ start, end: Math.min(start + chunkSize - 1, contentLength - 1) });
      }

      const buffers = await Promise.all(
        ranges.map(async (r) => {
          const res = await fetch(`${targetFormat.url}&range=${r.start}-${r.end}`, {
            headers: {
              'User-Agent':
                'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
            },
          });
          if (!res.ok) throw new Error('Chunk failed');
          return Buffer.from(await res.arrayBuffer());
        })
      );

      const finalBuf = Buffer.concat(buffers);
      if (finalBuf.length > 100000) return finalBuf;
    } else {
      const res = await fetch(targetFormat.url);
      if (res.ok) {
        const finalBuf = Buffer.from(await res.arrayBuffer());
        if (finalBuf.length > 100000) return finalBuf;
      }
    }
  } catch {}
  return null;
}

async function extractViaOceansaver(ytUrl: string): Promise<Buffer | null> {
  try {
    const initRes = await fetch(
      `https://p.oceansaver.in/ajax/download.php?format=m4a&url=${encodeURIComponent(
        ytUrl
      )}&api=dfcb6d76f2f6a9894gjkege8a4ab232222`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!initRes.ok) return null;
    const initData = await initRes.json();
    const jobId = initData.id;
    if (!jobId) return null;

    const progressUrl = initData.progress_url || `https://p.oceansaver.in/ajax/progress.php?id=${jobId}`;

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const progRes = await fetch(progressUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.progress === 1000 && progData.download_url) {
          const audioRes = await fetch(progData.download_url);
          if (audioRes.ok) {
            const buf = Buffer.from(await audioRes.arrayBuffer());
            if (buf.length > 100000) return buf;
          }
          break;
        }
      }
    }
  } catch {}
  return null;
}

async function resolveYouTubeAudioStream(videoId: string, targetUrl: string): Promise<Buffer | null> {
  const ytUrl = targetUrl || `https://www.youtube.com/watch?v=${videoId}`;

  const ytdlpBuf = await extractViaYtDlpRamPipe(ytUrl);
  if (ytdlpBuf) return ytdlpBuf;

  if (videoId) {
    const innerTubeBuf = await extractViaInnerTube(videoId);
    if (innerTubeBuf) return innerTubeBuf;
  }

  const oceanBuf = await extractViaOceansaver(ytUrl);
  if (oceanBuf) return oceanBuf;

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
      body: buffer,
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

      const videoId = track.videoId || extractYouTubeVideoId(track.url || '') || '';
      const audioBuffer = await resolveYouTubeAudioStream(videoId, track.url);

      if (!audioBuffer) {
        return NextResponse.json(
          { error: 'Không thể tải luồng âm thanh của video này. Vui lòng thử một video khác.' },
          { status: 502 }
        );
      }

      const uploaded = await uploadToGitHubCDN(audioBuffer, track.title || 'track');
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
        title: track.title,
        artist: track.artist || 'Nghệ sĩ chưa rõ',
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
