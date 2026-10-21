import { NextRequest, NextResponse } from 'next/server';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 giờ
const trendingMemoryCache = new Map<string, { updatedAt: number; results: any[] }>();

const CATEGORY_QUERIES: Record<string, string[]> = {
  trending: [
    'top bài hát thịnh hành việt nam official music video',
    'nhạc việt thịnh hành mới nhất official mv',
  ],
  vpop: [
    'vpop mới nhất official music video',
    'nhạc trẻ việt nam official mv mới nhất',
  ],
  rap: [
    'rap việt mới nhất thịnh hành official mv',
    'hip hop rap việt official music video',
  ],
  indie: [
    'indie việt official mv mới nhất',
    'nhạc indie chill việt nam official audio',
  ],
  usuk: [
    'pop hits official music video',
    'billboard hot 100 official music video',
  ],
};

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
  'vevo',
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

      if (channelSlug && (slug0 === channelSlug || channelSlug.includes(slug0) || slug0.includes(channelSlug))) {
        candidateArtist = part0;
        candidateTitle = part1;
      } else if (channelSlug && (slug1 === channelSlug || channelSlug.includes(slug1) || slug1.includes(channelSlug))) {
        candidateTitle = part0;
        candidateArtist = part1;
      } else {
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

function isCompilationOrNoiseTitle(rawTitle: string): boolean {
  const lower = (rawTitle || '').toLowerCase();
  const banned = [
    'tổng hợp',
    'liên khúc',
    'nonstop',
    'nhạc sống',
    'karaoke',
    '1 hour',
    '1 giờ',
    '30 phút',
    'những bài hát hay nhất',
    'top 10',
    'top 15',
    'top 20',
    'top 50',
    'playlist',
    'lofi tổng hợp',
    'vinahouse',
    'nhạc chế',
    'reaction',
    'teaser',
    'trailer',
  ];
  return banned.some((kw) => lower.includes(kw));
}

async function fetchYouTubeQueryResults(query: string): Promise<any[]> {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      next: { revalidate: 21600 },
    });

    if (!res.ok) return [];
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

    if (!jsonStr) return [];
    const data = JSON.parse(jsonStr);
    return collectVideoRenderers(data);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const categoryParam = (req.nextUrl.searchParams.get('category') || 'trending').toLowerCase();
  const category = CATEGORY_QUERIES[categoryParam] ? categoryParam : 'trending';

  const cached = trendingMemoryCache.get(category);
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS && cached.results.length > 0) {
    return NextResponse.json(
      { category, results: cached.results, cached: true },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200',
        },
      }
    );
  }

  try {
    const queries = CATEGORY_QUERIES[category] || CATEGORY_QUERIES.trending;
    const renderersArrays = await Promise.all(queries.map((q) => fetchYouTubeQueryResults(q)));
    const allRenderers = renderersArrays.flat();

    const results: any[] = [];
    const seenVideoIds = new Set<string>();
    const seenTitleSlugs = new Set<string>();

    for (const v of allRenderers) {
      if (!v?.videoId || seenVideoIds.has(v.videoId)) continue;
      const durationStr = v.lengthText?.simpleText;
      if (!durationStr) continue;

      // Chỉ chọn các bài hát đơn lẻ chuẩn (từ 1m30s đến 8m00s), loại bỏ Shorts và video gộp nhiều giờ
      const durationSec = parseDurationToSeconds(durationStr);
      if (durationSec < 90 || durationSec > 480) continue;

      const rawTitle =
        v.title?.runs?.map((r: any) => r.text).join('') ||
        v.title?.simpleText ||
        '';
      if (!rawTitle || isCompilationOrNoiseTitle(rawTitle)) continue;

      const rawArtist =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        'Nghệ sĩ chưa rõ';

      const clean = cleanTrackMetadata(rawTitle, rawArtist);
      const titleSlug = slugifyTitle(clean.title);
      if (!titleSlug || seenTitleSlugs.has(titleSlug)) continue;

      seenVideoIds.add(v.videoId);
      seenTitleSlugs.add(titleSlug);

      results.push({
        id: v.videoId,
        videoId: v.videoId,
        title: clean.title,
        artist: clean.artist,
        duration: durationSec,
        durationFormatted: formatSeconds(durationSec),
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        category,
        source: 'youtube',
      });

      if (results.length >= 16) break;
    }

    if (results.length > 0) {
      trendingMemoryCache.set(category, {
        updatedAt: Date.now(),
        results,
      });
    }

    return NextResponse.json(
      { category, results },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200',
        },
      }
    );
  } catch (err: any) {
    if (err?.digest) throw err;
    return NextResponse.json({ category, results: [] }, { status: 200 });
  }
}
