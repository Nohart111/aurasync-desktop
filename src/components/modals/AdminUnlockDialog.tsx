'use client';

import { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { finishAdminUnlock, submitAdminKey, subscribeUnlockRequests } from '@/lib/admin-client';

/** Asks for the admin key when a protected action (upload, import, delete) needs it. */
export function AdminUnlockDialog() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      subscribeUnlockRequests((next) => {
        setOpen(next);
        if (next) {
          setKey('');
          setError('');
          setBusy(false);
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      }),
    []
  );

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError('');
    const result = await submitAdminKey(key.trim());
    setBusy(false);
    if (result.ok) {
      finishAdminUnlock(true);
    } else {
      setError(result.error || 'Không thể mở khóa.');
      inputRef.current?.select();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 font-sans"
      onKeyDown={(e) => {
        if (e.key === 'Escape') finishAdminUnlock(false);
      }}
      role="presentation"
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-unlock-title"
        className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141424] to-[#07070c] p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <KeyRound className="h-4 w-4" />
          </span>
          <h2 id="admin-unlock-title" className="text-base font-bold">
            Mở khóa quản trị
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Nhập khóa quản trị để tải lên, nạp hoặc xóa bài hát. Trình duyệt này sẽ được ghi nhớ trong 30 ngày.
        </p>

        <input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Khóa quản trị"
          aria-label="Khóa quản trị"
          aria-invalid={Boolean(error)}
          className="mt-4 w-full select-text rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-sm text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/50"
        />
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => finishAdminUnlock(false)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={!key.trim() || busy}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black transition-opacity disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Mở khóa
          </button>
        </div>
      </form>
    </div>
  );
}
