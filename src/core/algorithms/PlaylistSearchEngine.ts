import { Track } from "./DoublyLinkedQueue";

class TrieNode {
  public children: Map<string, TrieNode> = new Map();
  public trackIds: Set<string> = new Set();
}

export class PlaylistSearchEngine {
  private root: TrieNode = new TrieNode();
  private trackById: Map<string, Track> = new Map();
  private sortedByBpm: Track[] = [];

  public indexTracks(tracks: Track[]): void {
    this.root = new TrieNode();
    this.trackById.clear();

    for (const track of tracks) {
      this.trackById.set(track.id, track);
      const tokens = this.tokenize(`${track.title} ${track.artist || ""} ${track.album || ""}`);
      for (const token of tokens) {
        this.insertToken(token, track.id);
      }
    }

    // Xử lý an toàn undefined khi so sánh BPM
    this.sortedByBpm = [...tracks].sort((a, b) => (a.bpm || 0) - (b.bpm || 0));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  private insertToken(token: string, trackId: string): void {
    let node = this.root;
    for (const char of token) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
      node.trackIds.add(trackId);
    }
  }

  public searchByPrefix(query: string): Track[] {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) return Array.from(this.trackById.values());

    let matchedIds: Set<string> | null = null;

    for (const token of tokens) {
      let node: TrieNode | undefined = this.root;
      for (const char of token) {
        node = node.children.get(char);
        if (!node) return [];
      }
      const currentTokenIds = node.trackIds;
      if (matchedIds === null) {
        matchedIds = new Set(currentTokenIds);
      } else {
        matchedIds = new Set(
          [...matchedIds].filter((id) => currentTokenIds.has(id))
        );
      }
    }

    if (!matchedIds) return [];
    return Array.from(matchedIds)
      .map((id) => this.trackById.get(id)!)
      .filter(Boolean);
  }

  public filterByBpmRange(minBpm: number, maxBpm: number): Track[] {
    const startIdx = this.lowerBoundBpm(minBpm);
    const endIdx = this.upperBoundBpm(maxBpm);
    if (startIdx > endIdx) return [];
    return this.sortedByBpm.slice(startIdx, endIdx + 1);
  }

  private lowerBoundBpm(target: number): number {
    let low = 0;
    let high = this.sortedByBpm.length - 1;
    let ans = this.sortedByBpm.length;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const track = this.sortedByBpm[mid];
      // Kiểm tra an toàn Object is possibly undefined
      if (track && (track.bpm || 0) >= target) {
        ans = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return ans;
  }

  private upperBoundBpm(target: number): number {
    let low = 0;
    let high = this.sortedByBpm.length - 1;
    let ans = -1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const track = this.sortedByBpm[mid];
      // Kiểm tra an toàn Object is possibly undefined
      if (track && (track.bpm || 0) <= target) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  }
}
