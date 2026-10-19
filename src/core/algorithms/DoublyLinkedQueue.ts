export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  bpm?: number;
  streamUrl?: string;
  url?: string;
  coverUrl?: string;
  dominantColors?: [string, string];
}

export class QueueNode {
  public prev: QueueNode | null = null;
  public next: QueueNode | null = null;
  constructor(public track: Track) {}
}

export class DoublyLinkedQueue {
  private head: QueueNode | null = null;
  private tail: QueueNode | null = null;
  private current: QueueNode | null = null;
  private nodeMap: Map<string, QueueNode> = new Map();

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

  public jumpTo(trackId: string): Track | null {
    const target = this.nodeMap.get(trackId);
    if (!target) return null;
    this.current = target;
    return target.track;
  }

  public next(): Track | null {
    if (!this.current) return null;
    if (this.current.next) {
      this.current = this.current.next;
      return this.current.track;
    }
    this.current = this.head;
    return this.head ? this.head.track : null;
  }

  public prev(): Track | null {
    if (!this.current) return null;
    if (this.current.prev) {
      this.current = this.current.prev;
      return this.current.track;
    }
    this.current = this.tail;
    return this.tail ? this.tail.track : null;
  }

  public getCurrent(): Track | null {
    return this.current ? this.current.track : null;
  }

  public peekNext(): Track | null {
    if (!this.current) return null;
    return this.current.next ? this.current.next.track : (this.head ? this.head.track : null);
  }

  public toArray(): Track[] {
    const result: Track[] = [];
    let curr = this.head;
    while (curr) {
      result.push(curr.track);
      curr = curr.next;
    }
    return result;
  }

  public clear(): void {
    this.head = null;
    this.tail = null;
    this.current = null;
    this.nodeMap.clear();
  }
}
