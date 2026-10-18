// src/core/algorithms/PlaylistSearchEngine.ts
import { Track } from "./DoublyLinkedQueue";

class TrieNode {
  public children: Map<string, TrieNode> = new Map();
  public trackIds: Set<string> = new Set();
}

/**
 * PlaylistSearchEngine:
 * 1. Prefix Trie lÆ°u chá»‰ má»¥c tá»« khÃ³a -> Tra cá»©u prefix trong O(L) (Ä‘á»™c láº­p vá»›i sá»‘ lÆ°á»£ng bÃ i hÃ¡t N).
 * 2. Sorted Index + Binary Search -> Lá»c bÃ i hÃ¡t theo khoáº£ng BPM hoáº·c Duration trong O(log N).
 */
export class PlaylistSearchEngine {
  private root: TrieNode = new TrieNode();
  private trackById: Map<string, Track> = new Map();
  private sortedByBpm: Track[] = [];

  public indexTracks(tracks: Track[]): void {
    this.root = new TrieNode();
    this.trackById.clear();

    for (const track of tracks) {
      this.trackById.set(track.id, track);
      const tokens = this.tokenize(`${track.title} ${track.artist} ${track.album}`);
      for (const token of tokens) {
        this.insertToken(token, track.id);
      }
    }

    // Sáº¯p xáº¿p má»™t láº§n khi náº¡p thÆ° viá»‡n O(N log N) Ä‘á»ƒ phá»¥c vá»¥ truy váº¥n khoáº£ng O(log N)
    this.sortedByBpm = [...tracks].sort((a, b) => a.bpm - b.bpm);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Bá» dáº¥u tiáº¿ng Viá»‡t Ä‘á»ƒ tÃ¬m kiáº¿m nhanh cáº£ cÃ³ dáº¥u & khÃ´ng dáº¥u
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

  // Tra cá»©u theo tiá»n tá»‘ tá»« khÃ³a: O(L) vá»›i L lÃ  Ä‘á»™ dÃ i chuá»—i truy váº¥n (O(1) theo N)
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
        matchedIds = new Set<string>(
          [...matchedIds].filter((id: string) => currentTokenIds.has(id))
        );
      }
    }

    if (!matchedIds) return [];
    return Array.from(matchedIds)
      .map((id) => this.trackById.get(id)!)
      .filter(Boolean);
  }

  // Lá»c bÃ i hÃ¡t theo dáº£i nhá»‹p Ä‘á»™ (BPM) báº±ng Binary Search: O(log N) tÃ¬m biÃªn
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
      if (this.sortedByBpm[mid].bpm >= target) {
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
      if (this.sortedByBpm[mid].bpm <= target) {
        ans = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return ans;
  }
}

