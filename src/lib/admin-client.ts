'use client';

// Client half of the admin lock. A write request that comes back 401 with
// code ADMIN_REQUIRED opens the unlock dialog; once unlocked, it is retried.

type UnlockListener = (open: boolean) => void;

let pendingUnlock: Promise<boolean> | null = null;
let resolvePending: ((unlocked: boolean) => void) | null = null;
const listeners = new Set<UnlockListener>();

/** Used by AdminUnlockDialog to show or hide itself. */
export function subscribeUnlockRequests(listener: UnlockListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the unlock dialog; resolves true once unlocked, false if dismissed. */
export function requestAdminUnlock(): Promise<boolean> {
  if (pendingUnlock) return pendingUnlock;
  if (listeners.size === 0) return Promise.resolve(false);
  pendingUnlock = new Promise<boolean>((resolve) => {
    resolvePending = resolve;
  });
  listeners.forEach((l) => l(true));
  return pendingUnlock;
}

/** Called by the dialog when it closes. */
export function finishAdminUnlock(unlocked: boolean): void {
  resolvePending?.(unlocked);
  resolvePending = null;
  pendingUnlock = null;
  listeners.forEach((l) => l(false));
}

export async function submitAdminKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data?.error || 'Không thể mở khóa.' };
  } catch {
    return { ok: false, error: 'Lỗi kết nối máy chủ.' };
  }
}

async function needsAdmin(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const data = await res.clone().json().catch(() => null);
  return data?.code === 'ADMIN_REQUIRED' && data?.configured !== false;
}

/** fetch() for write endpoints: prompts for the admin key on 401, then retries once. */
export async function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!(await needsAdmin(res))) return res;
  const unlocked = await requestAdminUnlock();
  return unlocked ? fetch(input, init) : res;
}
