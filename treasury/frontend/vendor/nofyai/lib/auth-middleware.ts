// ========================================
// API Auth Middleware
// ========================================
// 用于保护需要认证的 API 路由

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, extractTokenFromCookie } from './auth';

/**
 * 认证中间件
 * 验证请求的 session token，如果无效则返回 401
 *
 * @param request - Next.js request 对象
 * @returns 如果认证失败返回 NextResponse（401），否则返回 null
 */
export async function requireAuth(request: NextRequest): Promise<NextResponse | null> {
  const cookieHeader = request.headers.get('cookie');
  const token = extractTokenFromCookie(cookieHeader);

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: Login required' },
      { status: 401 }
    );
  }

  const isValid = await verifySessionToken(token);

  if (!isValid) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or expired session' },
      { status: 401 }
    );
  }

  // 认证成功，返回 null（允许继续处理请求）
  return null;
}

/**
 * 包装受保护的 API handler
 * 自动处理认证检查
 *
 * @param handler - 原始的 API handler 函数
 * @returns 包装后的 handler
 *
 * @example
 * export const POST = withAuth(async (request) => {
 *   // 这里的代码只在认证通过后执行
 *   return NextResponse.json({ success: true });
 * });
 */
export function withAuth(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    // 先检查认证
    const authError = await requireAuth(request);
    if (authError) {
      return authError;
    }

    // 认证通过，执行原始 handler
    return handler(request);
  };
}
