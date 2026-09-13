// ========================================
// Login API Route
// ========================================
// POST /api/auth/login
// 验证密码并返回 session token

import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, generateSessionToken } from '@/lib/auth';
import { getConfigLoader } from '@/lib/config-loader';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 确保配置已加载
    const configLoader = getConfigLoader();
    try {
      await configLoader.load();
    } catch (error) {
      // 配置可能已经加载过了，忽略错误
      console.log('[Auth] Config already loaded or load failed:', error);
    }

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // 添加1秒延迟，防止暴力破解
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证密码
    const isValid = await verifyPassword(password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // 生成 session token
    const token = await generateSessionToken();

    // 获取会话超时时间
    const config = configLoader.getConfig();
    const sessionTimeout = config.admin?.session_timeout_minutes || 60;

    // 设置 httpOnly cookie
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      expiresIn: sessionTimeout * 60 // 返回秒数
    });

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: sessionTimeout * 60, // 秒
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
