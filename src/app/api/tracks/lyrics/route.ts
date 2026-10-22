import { NextRequest, NextResponse } from 'next/server';

interface LrcLibTrack {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

interface CachedLyrics {
  data: {
    trackName: string;
    artistName: string;
    syncedLyrics?: string;
    plainLyrics?: string;
    instrumental: boolean;
    source: string;
  } | null;
  timestamp: number;
}

// In-memory cache với giới hạn tối đa 300 bài
const lyricsCache = new Map<string, CachedLyrics>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 giờ
const MAX_CACHE_SIZE = 300;

function cleanString(str: string): string {
  if (!str) return '';
  return str
    // Loại bỏ các tag định dạng phổ biến của video âm nhạc YouTube / SoundCloud
    .replace(/[\(\[\{](official\s*(music)?\s*(video|audio)|mv|lyric\s*video|visualizer|audio|prod\.[^)\],]+|ft\.[^)\],]+|feat\.[^)\],]+|4k|hd|1080p|remix|cover)[\)\]\}]/gi, '')
    // Loại bỏ các đoạn pipe / dấu gạch phân cách phụ vụ SEO
    .replace(/\|\s*official\s*(music)?\s*(video|audio)?/gi, '')
    // Loại bỏ dấu ngoặc đơn / vuông rỗng nếu còn sót
    .replace(/[\(\[\{]\s*[\)\]\}]/g, '')
    .trim();
}

function parseArtistAndTitle(rawTitle: string, rawArtist: string) {
  let title = rawTitle.trim();
  let artist = (rawArtist || '').trim();

  // Nếu artist rỗng hoặc là nhãn chung chung, thử tách từ Title dạng "Artist - Title"
  const isGenericArtist = !artist || /^(nghệ sĩ chưa rõ|unknown artist|youtube|soundcloud)$/i.test(artist);

  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      if (isGenericArtist) {
        artist = parts[0].trim();
      }
      title = parts.slice(1).join(' - ').trim();
    }
  }

  title = cleanString(title);
  artist = cleanString(artist);

  return { title, artist };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawTitle = searchParams.get('title') || '';
    const rawArtist = searchParams.get('artist') || '';
    const durationParam = searchParams.get('duration');
    const duration = durationParam ? Math.round(Number(durationParam)) : undefined;

    if (!rawTitle.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { title, artist } = parseArtistAndTitle(rawTitle, rawArtist);
    const cacheKey = `${title.toLowerCase()}:::${artist.toLowerCase()}`;

    // Kiểm tra cache
    const cached = lyricsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: Boolean(cached.data),
        cached: true,
        lyrics: cached.data,
      });
    }

    let foundTrack: LrcLibTrack | null = null;

    // 1. Thử gọi API lấy chính xác (Exact match) nếu có tên nghệ sĩ
    if (artist) {
      try {
        const getUrl = new URL('https://lrclib.net/api/get');
        getUrl.searchParams.set('track_name', title);
        getUrl.searchParams.set('artist_name', artist);
        if (duration && duration > 0) {
          getUrl.searchParams.set('duration', duration.toString());
        }

        const res = await fetch(getUrl.toString(), {
          headers: {
            'User-Agent': 'AuraSync-Desktop/1.0 (https://github.com/aurasync)',
          },
          signal: AbortSignal.timeout(4500),
        });

        if (res.ok) {
          const item = (await res.json()) as LrcLibTrack;
          if (item && (item.syncedLyrics || item.plainLyrics)) {
            foundTrack = item;
          }
        }
      } catch (err) {
        // Fallback sang Search
      }
    }

    // 2. Nếu chưa tìm được, tìm kiếm mờ (Fuzzy Search) qua /api/search
    if (!foundTrack) {
      try {
        const searchQuery = `${title} ${artist}`.trim();
        const searchUrl = new URL('https://lrclib.net/api/search');
        searchUrl.searchParams.set('q', searchQuery);

        const res = await fetch(searchUrl.toString(), {
          headers: {
            'User-Agent': 'AuraSync-Desktop/1.0 (https://github.com/aurasync)',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const list = (await res.json()) as LrcLibTrack[];
          if (Array.isArray(list) && list.length > 0) {
            // Ưu tiên 1: Có syncedLyrics và độ dài tương đồng
            const syncedWithDuration = list.find(
              (item) =>
                item.syncedLyrics &&
                (!duration || !item.duration || Math.abs(item.duration - duration) <= 12)
            );

            // Ưu tiên 2: Bất kỳ bài nào có syncedLyrics
            const anySynced = list.find((item) => Boolean(item.syncedLyrics));

            // Ưu tiên 3: Bài có plainLyrics
            const anyPlain = list.find((item) => Boolean(item.plainLyrics));

            foundTrack = syncedWithDuration || anySynced || anyPlain || list[0] || null;
          }
        }
      } catch (err) {
        // Timeout hoặc lỗi mạng bên thứ ba
      }
    }

    let resultPayload = null;
    if (foundTrack && (foundTrack.syncedLyrics || foundTrack.plainLyrics || foundTrack.instrumental)) {
      resultPayload = {
        trackName: foundTrack.trackName || foundTrack.name || title,
        artistName: foundTrack.artistName || artist,
        syncedLyrics: foundTrack.syncedLyrics || undefined,
        plainLyrics: foundTrack.plainLyrics || undefined,
        instrumental: Boolean(foundTrack.instrumental),
        source: 'lrclib',
      };
    }

    // Lưu cache (kể cả kết quả null để tránh spam request liên tục)
    if (lyricsCache.size >= MAX_CACHE_SIZE) {
      const firstKey = lyricsCache.keys().next().value;
      if (firstKey) lyricsCache.delete(firstKey);
    }
    lyricsCache.set(cacheKey, { data: resultPayload, timestamp: Date.now() });

    return NextResponse.json({
      success: Boolean(resultPayload),
      cached: false,
      lyrics: resultPayload,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
