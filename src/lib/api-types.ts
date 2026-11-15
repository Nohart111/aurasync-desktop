// Shapes of external data the API routes read: the track catalog JSON, the
// GitHub REST API, and YouTube's embedded search-results JSON. Only the fields
// the routes use are listed; everything else passes through untouched.

/** A track entry in data/catalog.json (locally or in the GitHub data repo). */
export interface CatalogTrack {
  id: string;
  title?: string;
  artist?: string;
  videoId?: string;
  streamUrl?: string;
  cdnUrl?: string;
  dateAdded?: string;
  [key: string]: unknown;
}

export interface GitHubReleaseAsset {
  id: number;
  name: string;
  url: string;
  browser_download_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface GitHubRelease {
  assets?: GitHubReleaseAsset[];
}

export interface GitHubWorkflow {
  id: number;
  name?: string;
  path?: string;
  state?: string;
}

export interface GitHubWorkflowRun {
  id: number;
  status?: string;
  conclusion?: string | null;
  created_at: string;
  [key: string]: unknown;
}

/** YouTube's text node: either `simpleText` or a list of `runs`. */
export interface YouTubeText {
  simpleText?: string;
  runs?: { text: string }[];
}

/** A `videoRenderer` object from YouTube's search results page data. */
export interface YouTubeVideoRenderer {
  videoId: string;
  title?: YouTubeText;
  lengthText?: YouTubeText;
  ownerText?: YouTubeText;
  longBylineText?: YouTubeText;
  viewCountText?: YouTubeText;
  shortViewCountText?: YouTubeText;
}

/** Walks YouTube's page JSON and collects every `videoRenderer` that has a video id. */
export function collectVideoRenderers(
  node: unknown,
  out: YouTubeVideoRenderer[] = []
): YouTubeVideoRenderer[] {
  if (!node || typeof node !== 'object') return out;
  const renderer = (node as { videoRenderer?: Partial<YouTubeVideoRenderer> }).videoRenderer;
  if (renderer && renderer.videoId) {
    out.push(renderer as YouTubeVideoRenderer);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, out);
  } else {
    for (const value of Object.values(node)) collectVideoRenderers(value, out);
  }
  return out;
}

/** Message from a caught error, or the fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  return (err instanceof Error && err.message) || fallback;
}

/**
 * Next.js signals control flow (redirect, notFound, dynamic bail-out) by
 * throwing errors that carry a `digest`; route handlers must rethrow those.
 */
export function isNextControlError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'digest' in err;
}
