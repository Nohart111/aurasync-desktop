// YouTube serves each thumbnail at several sizes. The app never shows covers
// larger than ~128px, so the 320x180 "mqdefault" image (no letterbox bars) is
// plenty and several times lighter than hqdefault (480x360) or maxresdefault.
const YT_THUMB = /^(https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[^/]+\/)(?:hq|sd|maxres)default(\.jpg|\.webp)(\?.*)?$/;

/** Smaller YouTube thumbnail URL for covers; other URLs are returned as-is. */
export function coverThumb(url?: string): string | undefined {
  if (!url) return url;
  if (YT_THUMB.test(url)) {
    return url.replace(YT_THUMB, (_m, base: string, ext: string) => `${base}mqdefault${ext}`);
  }
  // Unsplash fallback covers are requested at 600px wide; 256px covers 2x screens.
  if (url.startsWith('https://images.unsplash.com/')) {
    return url.replace(/([?&]w=)\d+/, '$1256');
  }
  return url;
}
