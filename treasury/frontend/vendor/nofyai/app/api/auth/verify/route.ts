// ========================================
// Verify API Route
// ========================================
// GET /api/auth/verify
// 验证当前 session 是否有效

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, extractTokenFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie');
    const token = extractTokenFromCookie(cookieHeader);

    if (!token) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    const isValid = await verifySessionToken(token);

    if (!isValid) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true
    });
  } catch (error) {
    console.error('[Auth] Verify error:', error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}
