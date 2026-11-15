import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  adminSessionValue,
  checkAdminKey,
  isAdminConfigured,
  isAdminRequest,
} from '@/lib/admin-auth';

/** Whether this browser can currently use the write endpoints. */
export async function GET(req: NextRequest) {
  return NextResponse.json(
    { unlocked: isAdminRequest(req), configured: isAdminConfigured() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Unlock: `{ key }` must match ADMIN_API_KEY. */
export async function POST(req: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Máy chủ chưa đặt ADMIN_API_KEY.', code: 'ADMIN_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  let key = '';
  try {
    const body = await req.json();
    key = typeof body?.key === 'string' ? body.key.trim() : '';
  } catch {}

  if (!checkAdminKey(key)) {
    // Slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: 'Khóa quản trị không đúng.' }, { status: 401 });
  }

  const res = NextResponse.json({ unlocked: true });
  res.cookies.set(ADMIN_COOKIE, adminSessionValue(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return res;
}

/** Lock again (sign out of admin). */
export async function DELETE() {
  const res = NextResponse.json({ unlocked: false });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
