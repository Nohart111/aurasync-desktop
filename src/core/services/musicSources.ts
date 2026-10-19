import type { Track } from "@/core/algorithms/DoublyLinkedQueue";

export interface NCTSearchTrack extends Track {
  nctKey: string;
}

interface NCTSearchResponse {
  tracks?: Array<Partial<Track> & { key?: string }>;
  error?: string;
}

interface NCTPlayableResponse extends Partial<Track> {
  error?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`NCT request failed (${response.status}).`);
  if (!text.trim()) throw new Error("NCT returned an empty response.");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("NCT returned an invalid response.");
  }
}

export async function searchNCTSongs(query: string): Promise<NCTSearchTrack[]> {
  const data = await fetchJson<NCTSearchResponse>(
    `/api/nct?q=${encodeURIComponent(query.trim())}`
  );
  if (data.error) throw new Error(data.error);

  return (data.tracks ?? [])
    .filter((track): track is Partial<Track> & { key: string } => Boolean(track.key))
    .map((track) => ({
      id: track.id || `nct_${track.key}`,
      nctKey: track.key,
      title: track.title || "Unknown title",
      artist: track.artist || "NCT artist",
      album: track.album || "NhacCuaTui",
      duration: track.duration || 0,
      bpm: track.bpm || 0,
      streamUrl: track.streamUrl || "",
      coverUrl: track.coverUrl || "",
      dominantColors: track.dominantColors || ["#00F0FF", "#8A2BE2"],
    }));
}

export async function getPlayableNCTTrack(key: string): Promise<Track> {
  const track = await fetchJson<NCTPlayableResponse>(
    `/api/nct?key=${encodeURIComponent(key)}`
  );
  if (track.error) throw new Error(track.error);
  if (!track.id || !track.title) throw new Error("NCT returned invalid track metadata.");

  // Bọc qua proxy để AudioEngine và Visualizer hoạt động không bị CORS
  if (track.streamUrl) {
    track.streamUrl = `/api/stream?url=${encodeURIComponent(track.streamUrl)}`;
  }

  return {
    id: track.id,
    title: track.title,
    artist: track.artist || "NCT artist",
    album: track.album || "NhacCuaTui",
    duration: track.duration || 0,
    bpm: track.bpm || 0,
    streamUrl: track.streamUrl || "",
    coverUrl: track.coverUrl || "",
    dominantColors: track.dominantColors || ["#00F0FF", "#8A2BE2"],
    nctKey: key,
  };
}