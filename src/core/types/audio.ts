export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  bpm?: number;
  streamUrl?: string;
  cdnUrl?: string;
  coverUrl?: string;
  thumbnail?: string;
  dominantColors?: [string, string];
  videoId?: string;
  isPreview?: boolean;
  streamCount?: number;
  viewCountText?: string;
  [key: string]: unknown;
}

export default Track;
