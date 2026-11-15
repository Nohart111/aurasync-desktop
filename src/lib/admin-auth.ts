import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

// Write endpoints (upload, delete, ingest) act on the GitHub data repo with the
// server's token, so they require an admin session. The admin enters
// ADMIN_API_KEY once; the server answers with an httpOnly, SameSite=strict
// cookie holding an HMAC of that key, which every write request must carry.

export const ADMIN_COOKIE = 'aurasound_admin';
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function adminKey(): string {
  return process.env.ADMIN_API_KEY?.trim() || '';
}

export function isAdminConfigured(): boolean {
  return adminKey().length > 0;
}

/**
 * Without ADMIN_API_KEY, writes stay open in local development for
 * convenience and are refused in production.
 */
function isOpenWithoutKey(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function sessionToken(key: string): string {
  return createHmac('sha256', key).update('aurasound-admin-session-v1').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** True when `candidate` is the configured admin key. */
export function checkAdminKey(candidate: string): boolean {
  const key = adminKey();
  if (!key || !candidate) return false;
  // Compare fixed-length digests so the key's length isn't leaked by timing.
  return safeEqual(sessionToken(candidate), sessionToken(key));
}

export function adminSessionValue(): string {
  return sessionToken(adminKey());
}

function readCookie(req: Request, name: string): string {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function isAdminRequest(req: Request): boolean {
  const key = adminKey();
  if (!key) return isOpenWithoutKey();
  const cookie = readCookie(req, ADMIN_COOKIE);
  return Boolean(cookie) && safeEqual(cookie, sessionToken(key));
}

/** 401 response the client recognizes and answers with the unlock dialog. */
export function adminRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: isAdminConfigured()
        ? 'Cần mở khóa quản trị để thực hiện thao tác này.'
        : 'Máy chủ chưa đặt ADMIN_API_KEY nên thao tác ghi đang bị khóa.',
      code: 'ADMIN_REQUIRED',
      configured: isAdminConfigured(),
    },
    { status: 401 }
  );
}
