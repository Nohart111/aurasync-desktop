import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Nohart111';
const GITHUB_REPO = process.env.GITHUB_REPO || 'aurasound-music-data';

const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog.json');

// Map chống gửi trùng tác vụ trong vòng 25 giây cho cùng 1 videoId
const recentDispatches = new Map<string, { requestId: string; startedAt: number }>();

function slugifyTitle(text: string): string {
  return (text || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

const KNOWN_DISTRIBUTORS = [
  'pops music',
  'pops',
  'pops kids',
  'warner music',
  'sony music',
  'universal music',
  'metub',
  'yeah1',
  'gala nhac viet',
  'vie channel',
  'vietalent',
  'dien quan',
  'nhacpro',
  'zing mp3',
  'nhaccuatui',
  'nam viet',
  'bh media',
  'acv music',
  'cty',
  'entertainment',
];

function isDistributor(channel: string): boolean {
  const s = slugifyTitle(channel);
  return KNOWN_DISTRIBUTORS.some((d) => s.includes(slugifyTitle(d)));
}

function cleanChannelName(channel: string): string {
  if (!channel) return '';
  return channel
    .replace(
      /\b(official(?:\s+(?:channel|mv|music|audio|artist))?|vevo|-?\s*topic|entertainment|network|media|music|vietnam|channel|tv)\b/gi,
      ''
    )
    .replace(/[-_.\s|/]+$/, '')
    .replace(/^[-_.\s|/]+/, '')
    .trim();
}

function toTitleCaseIfNeeded(str: string): string {
  if (!str) return '';
  const letters = str.replace(/[^a-zA-ZÀ-ỹ]/g, '');
  if (letters.length > 5 && letters === letters.toUpperCase()) {
    return str
      .toLowerCase()
      .split(' ')
      .map((w) => {
        if (w.includes('-')) {
          return w
            .split('-')
            .map((part) =>
              part.length <= 2
                ? part.toUpperCase()
                : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            )
            .join('-');
        }
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }
  return str;
}

function cleanTrackMetadata(rawTitle: string, rawArtist?: string): { title: string; artist: string } {
  let text = (rawTitle || 'Track').replace(/\.[a-zA-Z0-9]{2,4}$/, '').trim();

  // 1. Loại bỏ toàn bộ các thẻ chú thích rác phổ biến trên YouTube
  const junkPatterns = [
    /\[\s*(?:official\s*)?(?:music\s*)?(?:video|mv|m\/v|audio|lyric|lyrics?|visualizer|performance|teaser|trailer|hd|4k|full\s*hd|audio\s*lyrics?|audio\s*official)\s*\]/gi,
    /\(\s*(?:official\s*)?(?:music\s*)?(?:video|mv|m\/v|audio|lyric|lyrics?|visualizer|performance|teaser|trailer|hd|4k|full\s*hd|audio\s*lyrics?|audio\s*official)\s*\)/gi,
    /\[\s*(?:bản\s*(?:gốc|chuẩn|chính\s*thức|đầy\s*đủ|audio|mv|official))\s*\]/gi,
    /\(\s*(?:bản\s*(?:gốc|chuẩn|chính\s*thức|đầy\s*đủ|audio|mv|official))\s*\)/gi,
    /\[\s*(?:nhạc\s*(?:trẻ|phim|chế)?\s*(?:hay\s*nhất|mới\s*nhất|hot\s*tiktok)?)\s*\]/gi,
    /\(\s*(?:nhạc\s*(?:trẻ|phim|chế)?\s*(?:hay\s*nhất|mới\s*nhất|hot\s*tiktok)?)\s*\)/gi,
    /\[\s*(?:ost|nhạc\s*phim)[^\]]*\]/gi,
    /\(\s*(?:ost|nhạc\s*phim)[^\)]*\)/gi,
    /\[\s*(?:prod\.?\s*by|sáng\s*tác:?|nhạc:?|lời:?)[^\]]*\]/gi,
    /\(\s*(?:prod\.?\s*by|sáng\s*tác:?|nhạc:?|lời:?)[^\)]*\)/gi,
    /\|\s*(?:official\s*)?(?:music\s*)?(?:video|mv|m\/v|audio|lyrics?|hd|4k)[^|]*$/gi,
    /-\s*(?:official\s*)?(?:music\s*)?(?:video|mv|m\/v|audio|lyrics?|hd|4k)[^-]*$/gi,
    /\b(?:official\s+mv|official\s+music\s+video|official\s+video|official\s+audio|lyrics?\s+video)\b/gi,
  ];

  for (const pat of junkPatterns) {
    text = text.replace(pat, ' ');
  }
  text = text.replace(/\s+/g, ' ').trim();

  const cleanChannel = cleanChannelName(rawArtist || '');
  const channelSlug = slugifyTitle(cleanChannel);
  const distributor = isDistributor(rawArtist || '');

  let defaultArtist = distributor ? 'Nghệ sĩ chưa rõ' : cleanChannel || rawArtist || 'Nghệ sĩ chưa rõ';
  let candidateTitle = text;
  let candidateArtist = defaultArtist;

  // 2. Tách theo dấu phân cách phổ biến: " - " hoặc " | "
  let separator = '';
  if (text.includes(' - ')) separator = ' - ';
  else if (text.includes(' | ')) separator = ' | ';

  if (separator) {
    const rawParts = text.split(separator).map((p) => p.trim()).filter(Boolean);
    const parts = rawParts.filter(
      (p) => !/^(official\s*(mv|m\/v|video|audio)?|hd|4k|lyrics?)$/i.test(p)
    );

    if (parts.length >= 2) {
      const part0 = parts[0];
      const part1 = parts.slice(1).join(' - ');
      const slug0 = slugifyTitle(part0);
      const slug1 = slugifyTitle(part1);

      // Quy tắc A: Vế 0 trùng với tên Channel (ví dụ: "Hà Anh Tuấn - Tháng Tư Là Lời Nói Dối Của Em")
      if (channelSlug && (slug0 === channelSlug || channelSlug.includes(slug0) || slug0.includes(channelSlug))) {
        candidateArtist = part0;
        candidateTitle = part1;
      }
      // Quy tắc B: Vế 1 trùng với tên Channel (ví dụ: "Cho Tôi Đi Theo - Ngọt")
      else if (channelSlug && (slug1 === channelSlug || channelSlug.includes(slug1) || slug1.includes(channelSlug))) {
        candidateTitle = part0;
        candidateArtist = part1;
      }
      // Quy tắc C: Kênh là Distributor hoặc cả 2 vế không trùng tên kênh
      else {
        const hasArtistCollab0 = /\b(ft\.?|feat\.?|x|&)\b/i.test(part0);
        const hasArtistCollab1 = /\b(ft\.?|feat\.?|x|&)\b/i.test(part1);

        if (hasArtistCollab0 && !hasArtistCollab1) {
          candidateArtist = part0;
          candidateTitle = part1;
        } else if (hasArtistCollab1 && !hasArtistCollab0) {
          candidateTitle = part0;
          candidateArtist = part1;
        } else if (distributor) {
          if (separator === ' | ') {
            candidateTitle = part0;
            candidateArtist = part1;
          } else {
            candidateArtist = part0;
            candidateTitle = part1;
          }
        } else {
          candidateArtist = part0;
          candidateTitle = part1;
        }
      }
    } else if (parts.length === 1) {
      candidateTitle = parts[0];
    }
  }

  // 3. Dọn dẹp ký tự thừa và chuẩn hóa viết hoa
  candidateTitle = candidateTitle.replace(/^["'\s\-_|/]+|["'\s\-_|/]+$/g, '').trim();
  candidateArtist = candidateArtist.replace(/^["'\s\-_|/]+|["'\s\-_|/]+$/g, '').trim();

  candidateTitle = candidateTitle.replace(/\s*[-_|/]\s*(?:official|mv|m\/v|audio|lyric|lyrics?)$/i, '').trim();
  candidateArtist = candidateArtist.replace(/\s*[-_|/]\s*(?:official|mv|m\/v|audio|lyric|lyrics?)$/i, '').trim();

  candidateTitle = toTitleCaseIfNeeded(candidateTitle);
  candidateArtist = toTitleCaseIfNeeded(candidateArtist);

  return {
    title: candidateTitle || 'Track',
    artist: candidateArtist || defaultArtist || 'Nghệ sĩ chưa rõ',
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
  if (!input) return null;
  const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) return input.trim();
  return null;
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
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/catalog.json`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
  }

  try {
    let res = await fetch(apiUrl, { headers, cache: 'no-store' });
    if (!res.ok && GITHUB_TOKEN) {
      res = await fetch(apiUrl, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
    }
    if (res.ok) {
      const data = await res.json();
      if (data?.content) {
        const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        if (Array.isArray(parsed)) {
          return parsed.filter((t) => t && (t.streamUrl || t.cdnUrl)).map(normalizeTrackStreamUrl);
        }
      }
    }
  } catch {}

  try {
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/data/catalog.json?t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (rawRes.ok) {
      const parsed = await rawRes.json();
      if (Array.isArray(parsed)) {
        return parsed.filter((t) => t && (t.streamUrl || t.cdnUrl)).map(normalizeTrackStreamUrl);
      }
    }
  } catch {}

  return [];
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

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  try {
    let targetBranch = 'main';
    let workflowTarget = 'ingest.yml';

    try {
      const repoRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
        headers,
        cache: 'no-store',
      });
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        if (repoData?.default_branch) targetBranch = repoData.default_branch;
      }

      const wfRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows`,
        { headers, cache: 'no-store' }
      );
      if (wfRes.ok) {
        const wfData = await wfRes.json();
        const workflows: any[] = wfData?.workflows || [];
        const found = workflows.find(
          (w) =>
            w.state === 'active' &&
            (w.path?.endsWith('ingest.yml') ||
              w.path?.endsWith('ingest.yaml') ||
              w.name?.toLowerCase().includes('ingest') ||
              w.name?.toLowerCase().includes('aurasound'))
        );
        if (found) {
          workflowTarget = String(found.id || found.path?.split('/').pop() || 'ingest.yml');
        }
      }
    } catch {}

    const workflowUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${workflowTarget}/dispatches`;

    const res = await fetch(workflowUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: targetBranch,
        inputs,
      }),
      cache: 'no-store',
    });

    if (res.status === 204 || res.ok) {
      return { ok: true };
    }

    if (res.status === 422) {
      const errTxt = await res.text();

      if (errTxt.includes('workflow_dispatch')) {
        const altBranch = targetBranch === 'main' ? 'master' : 'main';
        const altRes = await fetch(workflowUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ref: altBranch,
            inputs,
          }),
          cache: 'no-store',
        });
        if (altRes.status === 204 || altRes.ok) {
          return { ok: true };
        }

        return {
          ok: false,
          error:
            'GitHub Actions chưa nhận diện được trigger workflow_dispatch trên nhánh chính. Vui lòng kiểm tra lại file .github/workflows/ingest.yml trên nhánh main của repository Nohart111/aurasound-music-data.',
        };
      }

      const fallbackRes = await fetch(workflowUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: targetBranch,
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
  title?: string,
  minTimestampMs?: number
): any | null {
  if (!Array.isArray(catalog) || catalog.length === 0) return null;

  if (requestId) {
    const exactById = catalog.find((t) => t && (t.streamUrl || t.cdnUrl) && t.id === requestId);
    if (exactById) return exactById;
  }

  const isRecentEnough = (t: any): boolean => {
    if (!minTimestampMs) return true;
    if (t.dateAdded) {
      const addedMs = new Date(t.dateAdded).getTime();
      if (!isNaN(addedMs)) {
        return addedMs >= minTimestampMs - 15000;
      }
    }
    return false;
  };

  for (const t of catalog) {
    if (!t || !(t.streamUrl || t.cdnUrl)) continue;
    if (!isRecentEnough(t)) continue;
    if (videoId && t.videoId && t.videoId === videoId) return t;
  }

  if (title) {
    const targetSlug = slugifyTitle(title);
    const matchByTitle = catalog.find(
      (t) =>
        t &&
        (t.streamUrl || t.cdnUrl) &&
        isRecentEnough(t) &&
        t.title &&
        slugifyTitle(t.title) === targetSlug
    );
    if (matchByTitle) return matchByTitle;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action,
      query,
      track,
      requestId,
      runId,
      videoId: pollVideoId,
      title: pollTitle,
      startedAt,
      force,
    } = body;

    // 1. TÌM KIẾM VIDEO YOUTUBE
    if (action === 'search') {
      if (!query || typeof query !== 'string' || !query.trim()) {
        return NextResponse.json({ results: [] });
      }
      const results = await searchYouTube(query.trim());
      return NextResponse.json({ results });
    }

    // 2. HỦY TÁC VỤ ĐANG CHẠY TRÊN GITHUB ACTIONS
    if (action === 'cancel') {
      if (pollVideoId) recentDispatches.delete(String(pollVideoId));
      if (pollTitle) recentDispatches.delete(slugifyTitle(String(pollTitle)));
      for (const [k, v] of recentDispatches.entries()) {
        if (requestId && v.requestId === requestId) {
          recentDispatches.delete(k);
        }
      }

      let cancelledRunId: number | string | null = runId || null;

      if (GITHUB_TOKEN) {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${GITHUB_TOKEN}`,
        };

        try {
          if (!cancelledRunId) {
            const runsRes = await fetch(
              `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/ingest.yml/runs?per_page=6`,
              { headers, cache: 'no-store' }
            );
            if (runsRes.ok) {
              const runsData = await runsRes.json();
              const runs: any[] = runsData.workflow_runs || [];
              const parsedStart =
                typeof startedAt === 'number'
                  ? startedAt
                  : startedAt
                  ? new Date(startedAt).getTime()
                  : Date.now() - 60000;
              const threshold = (isNaN(parsedStart) ? Date.now() : parsedStart) - 45000;

              const activeRun = runs.find(
                (r) =>
                  (r.status === 'in_progress' ||
                    r.status === 'queued' ||
                    r.status === 'waiting' ||
                    r.status === 'pending' ||
                    r.status === 'requested') &&
                  new Date(r.created_at).getTime() >= threshold
              );
              if (activeRun?.id) {
                cancelledRunId = activeRun.id;
              }
            }
          }

          if (cancelledRunId) {
            await fetch(
              `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${cancelledRunId}/cancel`,
              {
                method: 'POST',
                headers,
                cache: 'no-store',
              }
            );
          }
        } catch (e) {
          console.warn('Lỗi gửi lệnh hủy workflow GitHub Actions:', e);
        }
      }

      return NextResponse.json({
        status: 'cancelled',
        runId: cancelledRunId,
        message: 'Đã hủy tác vụ tải nhạc.',
      });
    }

    // 3. KÍCH HOẠT TÁC VỤ TẢI NHẠC QUA GITHUB ACTIONS
    if (action === 'ingest') {
      const trackInput = track && typeof track === 'object' ? track : body;
      const rawUrl = String(trackInput.url || trackInput.videoUrl || body.url || body.query || '').trim();
      const videoId = String(
        trackInput.videoId ||
          trackInput.id ||
          body.videoId ||
          body.id ||
          extractYouTubeVideoId(rawUrl) ||
          ''
      ).trim();

      if (!videoId && !rawUrl) {
        return NextResponse.json(
          { error: 'URL hoặc thông tin bài hát không hợp lệ.' },
          { status: 400 }
        );
      }

      const ytUrl =
        rawUrl && rawUrl.startsWith('http')
          ? rawUrl
          : videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : '';

      if (!ytUrl || !ytUrl.startsWith('http')) {
        return NextResponse.json({ error: 'Đường dẫn YouTube không hợp lệ.' }, { status: 400 });
      }

      const clean = cleanTrackMetadata(
        trackInput.title || body.title || 'Track',
        trackInput.artist || body.artist
      );

      if (!force) {
        const currentCatalog = await fetchGitHubCatalog();
        const existing = findMatchingTrackInCatalog(currentCatalog, undefined, videoId, clean.title);
        const isVerifiedMp3 =
          existing &&
          existing.format === 'mp3' &&
          String(existing.streamUrl || existing.cdnUrl || '').toLowerCase().includes('.mp3');

        if (existing && isVerifiedMp3) {
          return NextResponse.json({
            status: 'completed',
            duplicate: true,
            alreadyExists: true,
            track: existing,
          });
        }
      }

      const dedupeKey = videoId || slugifyTitle(clean.title);
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
      const thumbUrl =
        trackInput.thumbnail ||
        body.thumbnail ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
      const durVal = String(trackInput.duration || body.duration || 240);

      const dispatchResult = await dispatchGitHubWorkflow({
        request_id: newRequestId,
        video_id: videoId,
        video_url: ytUrl,
        title: clean.title,
        artist: clean.artist,
        thumbnail: thumbUrl,
        duration: durVal,
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

    // 4. KIỂM TRA TRẠNG THÁI TÁC VỤ (POLLING TỪ FRONTEND)
    if (action === 'status') {
      const parsedStart =
        typeof startedAt === 'number'
          ? startedAt
          : startedAt
          ? new Date(startedAt).getTime()
          : Date.now();
      const safeStartMs = isNaN(parsedStart) ? Date.now() : parsedStart;

      const catalog = await fetchGitHubCatalog();
      const matchedTrack = findMatchingTrackInCatalog(
        catalog,
        requestId,
        pollVideoId,
        pollTitle,
        safeStartMs
      );

      if (matchedTrack) {
        try {
          await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf-8');
        } catch {}

        return NextResponse.json({
          status: 'completed',
          track: matchedTrack,
        });
      }

      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
        };
        if (GITHUB_TOKEN) {
          headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
        }

        const runsRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/ingest.yml/runs?per_page=5`,
          {
            headers,
            cache: 'no-store',
          }
        );

        if (runsRes.ok) {
          const runsData = await runsRes.json();
          const runs: any[] = runsData.workflow_runs || [];
          const threshold = safeStartMs - 45000;

          const relevantRun = runs.find((r) => {
            const createdMs = new Date(r.created_at).getTime();
            return createdMs >= threshold;
          });

          if (!relevantRun) {
            const msg = 'Đang chờ máy ảo GitHub Actions tiếp nhận tác vụ...';
            return NextResponse.json({
              status: 'queued',
              step: msg,
              message: msg,
            });
          }

          if (
            relevantRun.status === 'queued' ||
            relevantRun.status === 'waiting' ||
            relevantRun.status === 'pending' ||
            relevantRun.status === 'requested'
          ) {
            const msg = 'Đang xếp hàng chờ máy ảo GitHub Actions...';
            return NextResponse.json({
              status: 'queued',
              runId: relevantRun.id,
              step: msg,
              message: msg,
            });
          }

          if (relevantRun.status === 'in_progress') {
            const msg = 'GitHub Actions đang tải nhạc & chuẩn hóa MP3 vào kho lưu trữ...';
            return NextResponse.json({
              status: 'downloading',
              runId: relevantRun.id,
              step: msg,
              message: msg,
            });
          }

          if (relevantRun.status === 'completed') {
            if (relevantRun.conclusion === 'success') {
              const freshCatalog = await fetchGitHubCatalog();
              const confirmed = findMatchingTrackInCatalog(
                freshCatalog,
                requestId,
                pollVideoId,
                pollTitle,
                safeStartMs
              );
              if (confirmed) {
                try {
                  await fs.writeFile(CATALOG_PATH, JSON.stringify(freshCatalog, null, 2), 'utf-8');
                } catch {}
                return NextResponse.json({
                  status: 'completed',
                  runId: relevantRun.id,
                  track: confirmed,
                });
              }

              const msg = 'Đang đồng bộ dữ liệu bài hát về website...';
              return NextResponse.json({
                status: 'downloading',
                runId: relevantRun.id,
                step: msg,
                message: msg,
              });
            } else if (relevantRun.conclusion === 'cancelled') {
              return NextResponse.json({
                status: 'cancelled',
                runId: relevantRun.id,
                error: 'Đã hủy tác vụ tải nhạc.',
              });
            } else {
              return NextResponse.json({
                status: 'failed',
                runId: relevantRun.id,
                error: `Workflow tải nhạc thất bại (${relevantRun.conclusion || 'error'}). Vui lòng thử lại hoặc chọn nguồn video khác.`,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Lỗi kiểm tra trạng thái workflow:', e);
      }

      const fallbackMsg = 'Đang xử lý tác vụ trên GitHub Actions...';
      return NextResponse.json({
        status: 'downloading',
        step: fallbackMsg,
        message: fallbackMsg,
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
  } catch (error: any) {
    if (error?.digest) throw error;
    console.error('Lỗi Ingest API:', error);
    return NextResponse.json({ error: error.message || 'Lỗi máy chủ.' }, { status: 500 });
  }
}
