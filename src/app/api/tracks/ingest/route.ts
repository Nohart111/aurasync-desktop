import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

// Map chống gửi trùng tác vụ trong vòng 25 giây cho cùng 1 videoId
const recentDispatches = new Map<string, { requestId: string; startedAt: number }>();

function cleanTrackMetadata(rawTitle: string, rawArtist?: string): { title: string; artist: string } {
  let title = rawTitle.replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();

  title = title
    .replace(/\[\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO|MV|AUDIO|LYRIC|HD|4K|VISUALIZER|PERFORMANCE)\s*\]/gi, '')
    .replace(/\(\s*(?:OFFICIAL\s*)?(?:MUSIC\s*)?(?:VIDEO|MV|AUDIO|LYRICS?|HD|4K|VISUALIZER|PERFORMANCE)\s*\)/gi, '')
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

function normalizeTrackStreamUrl(t: any) {
  if (!t) return t;
  const rawUrl = t.streamUrl || t.cdnUrl || '';
  let streamUrl = rawUrl;
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    if (rawUrl.includes('/releases/download/')) {
      const parts = rawUrl.split('/');
      const filePart = parts[parts.length - 1];
      if (filePart) {
        streamUrl = `/api/tracks/stream?file=${encodeURIComponent(decodeURIComponent(filePart))}`;
      }
    } else {
      streamUrl = `/api/tracks/stream?url=${encodeURIComponent(rawUrl)}`;
    }
  } else if (rawUrl && !rawUrl.startsWith('/api/tracks/stream')) {
    streamUrl = `/api/tracks/stream?file=${encodeURIComponent(rawUrl)}`;
  }
  return { ...t, streamUrl };
}

async function fetchGitHubCatalog(): Promise<any[]> {
  if (!GITHUB_TOKEN) return [];
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.content) return [];
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed.filter((t) => t && (t.streamUrl || t.cdnUrl)).map(normalizeTrackStreamUrl) : [];
  } catch {
    return [];
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

async function dispatchGitHubWorkflow(inputs: {
  request_id: string;
  video_id: string;
  video_url: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!GITHUB_TOKEN) {
    return { ok: false, error: 'Chưa cấu hình biến môi trường GITHUB_TOKEN trên máy chủ.' };
  }

  const workflowUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/ingest.yml/dispatches`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  try {
    // Thử gửi với đầy đủ request_id & video_id
    const res = await fetch(workflowUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: 'main',
        inputs,
      }),
      cache: 'no-store',
    });

    if (res.status === 204 || res.ok) {
      return { ok: true };
    }

    // Nếu ingest.yml trên repo chưa khai báo input request_id/video_id (lỗi 422), tự động fallback về 5 input cơ bản
    if (res.status === 422) {
      const fallbackRes = await fetch(workflowUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            video_url: inputs.video_url,
            title: inputs.title,
            artist: inputs.artist,
            thumbnail: inputs.thumbnail,
            duration: inputs.duration,
          },
        }),
        cache: 'no-store',
      });
      if (fallbackRes.status === 204 || fallbackRes.ok) {
        return { ok: true };
      }
      const errTxt = await fallbackRes.text();
      return { ok: false, error: `GitHub Actions từ chối yêu cầu (422): ${errTxt}` };
    }

    const errText = await res.text();
    return { ok: false, error: `Lỗi kích hoạt GitHub Actions (${res.status}): ${errText}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi kết nối tới GitHub API.' };
  }
}

function findMatchingTrackInCatalog(
  catalog: any[],
  requestId?: string,
  videoId?: string,
  title?: string
): any | null {
  if (!Array.isArray(catalog) || catalog.length === 0) return null;

  for (const t of catalog) {
    if (!t || !(t.streamUrl || t.cdnUrl)) continue;
    if (requestId && t.id === requestId) return t;
    if (videoId && t.videoId && t.videoId === videoId) return t;
  }

  if (title) {
    const cleanTarget = title.trim().toLowerCase();
    const matchByTitle = catalog.find(
      (t) => t && (t.streamUrl || t.cdnUrl) && t.title && t.title.trim().toLowerCase() === cleanTarget
    );
    if (matchByTitle) return matchByTitle;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, query, track, requestId, videoId: pollVideoId, title: pollTitle, startedAt } = body;

    // 1. TÌM KIẾM VIDEO YOUTUBE
    if (action === 'search') {
      if (!query || typeof query !== 'string' || !query.trim()) {
        return NextResponse.json({ results: [] });
      }
      const results = await searchYouTube(query.trim());
      return NextResponse.json({ results });
    }

    // 2. KÍCH HOẠT TÁC VỤ TẢI NHẠC QUA GITHUB ACTIONS (KHÔNG BỊ GIỚI HẠN TIMEOUT VERCEL)
    if (action === 'ingest') {
      if (!track || (!track.videoId && !track.url)) {
        return NextResponse.json({ error: 'URL hoặc thông tin bài hát không hợp lệ.' }, { status: 400 });
      }

      const videoId = track.videoId || extractYouTubeVideoId(track.url || '') || '';
      const ytUrl = track.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
      if (!ytUrl || !ytUrl.startsWith('http')) {
        return NextResponse.json({ error: 'Đường dẫn YouTube không hợp lệ.' }, { status: 400 });
      }

      const clean = cleanTrackMetadata(track.title || 'Track', track.artist);

      // Kiểm tra bài hát đã tồn tại trong kho chưa (chống tải trùng)
      const currentCatalog = await fetchGitHubCatalog();
      const existing = findMatchingTrackInCatalog(currentCatalog, undefined, videoId, clean.title);
      if (existing) {
        return NextResponse.json({
          status: 'completed',
          alreadyExists: true,
          track: existing,
        });
      }

      // Kiểm tra tác vụ đang chạy trùng cho cùng videoId trong 25 giây gần nhất
      const dedupeKey = videoId || clean.title.toLowerCase();
      const prevDispatch = recentDispatches.get(dedupeKey);
      if (prevDispatch && Date.now() - prevDispatch.startedAt < 25000) {
        return NextResponse.json({
          status: 'queued',
          requestId: prevDispatch.requestId,
          videoId,
          title: clean.title,
          startedAt: prevDispatch.startedAt,
          message: 'Tác vụ tải bài hát này đã được gửi và đang xử lý trên GitHub Actions...',
        });
      }

      const newRequestId = `trk-${videoId || 'yt'}-${Date.now()}`;
      const dispatchNow = Date.now();

      const dispatchResult = await dispatchGitHubWorkflow({
        request_id: newRequestId,
        video_id: videoId,
        video_url: ytUrl,
        title: clean.title,
        artist: clean.artist,
        thumbnail: track.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
        duration: String(track.duration || 240),
      });

      if (!dispatchResult.ok) {
        return NextResponse.json(
          { error: dispatchResult.error || 'Không thể kích hoạt workflow tải nhạc trên GitHub.' },
          { status: 502 }
        );
      }

      recentDispatches.set(dedupeKey, { requestId: newRequestId, startedAt: dispatchNow });

      return NextResponse.json(
        {
          status: 'queued',
          requestId: newRequestId,
          videoId,
          title: clean.title,
          startedAt: dispatchNow,
          message: 'Đã chuyển tác vụ sang GitHub Actions. Đang chờ khởi tạo...',
        },
        { status: 202 }
      );
    }

    // 3. KIỂM TRA TRẠNG THÁI TÁC VỤ (POLLING TỪ FRONTEND)
    if (action === 'status') {
      if (!GITHUB_TOKEN) {
        return NextResponse.json({ status: 'failed', error: 'Thiếu cấu hình GITHUB_TOKEN.' }, { status: 500 });
      }

      // Bước A: Kiểm tra xem bài hát đã thực sự xuất hiện trong catalog.json trên GitHub chưa
      const catalog = await fetchGitHubCatalog();
      const matchedTrack = findMatchingTrackInCatalog(catalog, requestId, pollVideoId, pollTitle);

      if (matchedTrack) {
        // Đồng bộ về file local nếu ở môi trường cho phép ghi
        try {
          await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
        } catch {}

        return NextResponse.json({
          status: 'completed',
          track: matchedTrack,
        });
      }

      // Bước B: Kiểm tra trạng thái thực tế của GitHub Actions workflow run
      try {
        const runsRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/ingest.yml/runs?per_page=5`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
            },
            cache: 'no-store',
          }
        );

        if (runsRes.ok) {
          const runsData = await runsRes.json();
          const runs: any[] = runsData.workflow_runs || [];
          const threshold = (startedAt || Date.now()) - 45000;

          const relevantRun = runs.find((r) => {
            const createdMs = new Date(r.created_at).getTime();
            return createdMs >= threshold;
          });

          if (!relevantRun) {
            return NextResponse.json({
              status: 'queued',
              step: 'Đang chờ máy ảo GitHub Actions tiếp nhận tác vụ...',
            });
          }

          if (
            relevantRun.status === 'queued' ||
            relevantRun.status === 'waiting' ||
            relevantRun.status === 'pending' ||
            relevantRun.status === 'requested'
          ) {
            return NextResponse.json({
              status: 'queued',
              step: 'Đang xếp hàng chờ máy ảo GitHub Actions...',
            });
          }

          if (relevantRun.status === 'in_progress') {
            return NextResponse.json({
              status: 'downloading',
              step: 'GitHub Actions đang tải nhạc & lưu vào kho lưu trữ...',
            });
          }

          if (relevantRun.status === 'completed') {
            if (relevantRun.conclusion === 'success') {
              // Đọc lại catalog.json lần nữa phòng trường hợp commit vừa hoàn tất
              const freshCatalog = await fetchGitHubCatalog();
              const confirmed = findMatchingTrackInCatalog(freshCatalog, requestId, pollVideoId, pollTitle);
              if (confirmed) {
                try {
                  await fs.writeFile(CATALOG_PATH, JSON.stringify(freshCatalog, null, 2), 'utf-8');
                } catch {}
                return NextResponse.json({
                  status: 'completed',
                  track: confirmed,
                });
              }

              return NextResponse.json({
                status: 'downloading',
                step: 'Đang đồng bộ dữ liệu bài hát về website...',
              });
            } else {
              return NextResponse.json({
                status: 'failed',
                error: `Workflow tải nhạc thất bại (${relevantRun.conclusion || 'error'}). Vui lòng thử nguồn video khác.`,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Lỗi kiểm tra trạng thái workflow:', e);
      }

      return NextResponse.json({
        status: 'downloading',
        step: 'Đang xử lý tác vụ trên GitHub Actions...',
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (error: any) {
    if (error?.digest) throw error;
    console.error('Lỗi Ingest API:', error);
    return NextResponse.json({ error: error.message || 'Lỗi máy chủ.' }, { status: 500 });
  }
}
