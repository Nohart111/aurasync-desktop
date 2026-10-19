// src/core/algorithms/DoublyLinkedQueue.ts
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // tính bằng giây
  bpm: number;
  streamUrl: string; // URL từ Cloudflare R2 hỗ trợ HTTP Range
  coverUrl: string;
  dominantColors: [string, string];
  youtubeVideoId?: string;
  soundCloudId?: number;
  soundCloudPermalink?: string;
  r2Key?: string;
  isCachedOnR2?: boolean;
  externalStreamUrl?: string;
}

export class QueueNode {
  public prev: QueueNode | null = null;
  public next: QueueNode | null = null;
  constructor(public track: Track) {}
}

/**
 * DoublyLinkedQueue: Kết hợp Doubly Linked List và Hash Map (Map<string, QueueNode>)
 * Đảm bảo O(1) cho enqueue, removeById, insertAfterCurrent (Play Next), và jumpToTrack.
 */
export class DoublyLinkedQueue {
  private head: QueueNode | null = null;
  private tail: QueueNode | null = null;
  private current: QueueNode | null = null;
  private nodeMap: Map<string, QueueNode> = new Map();

  // Thêm bài hát vào cuối hàng đợi: O(1)
  public enqueue(track: Track): void {
    if (this.nodeMap.has(track.id)) return;
    const newNode = new QueueNode(track);
    this.nodeMap.set(track.id, newNode);

    if (!this.head || !this.tail) {
      this.head = this.tail = this.current = newNode;
      return;
    }

    this.tail.next = newNode;
    newNode.prev = this.tail;
    this.tail = newNode;
  }

  // Chèn bài hát phát ngay sau bài hiện tại (Play Next): O(1)
  public insertAfterCurrent(track: Track): void {
    if (this.nodeMap.has(track.id)) {
      this.removeById(track.id);
    }
    if (!this.current) {
      this.enqueue(track);
      return;
    }

    const newNode = new QueueNode(track);
    this.nodeMap.set(track.id, newNode);

    const nextNode = this.current.next;
    this.current.next = newNode;
    newNode.prev = this.current;
    newNode.next = nextNode;

    if (nextNode) {
      nextNode.prev = newNode;
    } else {
      this.tail = newNode;
    }
  }

  // Xóa bất kỳ bài hát nào theo ID mà không cần duyệt mảng: O(1)
  public removeById(trackId: string): boolean {
    const target = this.nodeMap.get(trackId);
    if (!target) return false;

    if (target.prev) {
      target.prev.next = target.next;
    } else {
      this.head = target.next;
    }

    if (target.next) {
      target.next.prev = target.prev;
    } else {
      this.tail = target.prev;
    }

    if (this.current === target) {
      this.current = target.next ?? target.prev;
    }

    target.prev = null;
    target.next = null;
    this.nodeMap.delete(trackId);
    return true;
  }

  // Nhảy trực tiếp tới bài hát bất kỳ theo ID: O(1)
  public jumpTo(trackId: string): Track | null {
    const node = this.nodeMap.get(trackId);
    if (!node) return null;
    this.current = node;
    return node.track;
  }

  // Chuyển sang bài kế tiếp: O(1)
  public next(): Track | null {
    if (!this.current?.next) return null;
    this.current = this.current.next;
    return this.current.track;
  }

  // Lùi về bài trước đó: O(1)
  public prev(): Track | null {
    if (!this.current?.prev) return null;
    this.current = this.current.prev;
    return this.current.track;
  }

  // Lấy bài kế tiếp để Gapless Preloader tải trước vào bộ nhớ đệm: O(1)
  public peekNext(): Track | null {
    return this.current?.next?.track ?? null;
  }

  public getCurrent(): Track | null {
    return this.current?.track ?? null;
  }

  public toArray(): Track[] {
    const result: Track[] = [];
    let ptr = this.head;
    while (ptr) {
      result.push(ptr.track);
      ptr = ptr.next;
    }
    return result;
  }
}
