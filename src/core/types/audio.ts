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
  [key: string]: any;
}

export default Track;
