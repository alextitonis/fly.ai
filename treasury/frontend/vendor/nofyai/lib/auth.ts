// ========================================
// Authentication Utilities
// ========================================
// 用于密码验证、JWT 生成和验证

import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { getSystemConfig, getSessionTimeout } from './config-loader';

// JWT 密钥（使用环境变量或默认值）
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'nofyai-default-secret-change-in-production'
);

const JWT_ALG = 'HS256';

/**
 * 验证密码
 * @param password - 用户输入的密码
 * @returns 是否验证成功
 */
export async function verifyPassword(password: string): Promise<boolean> {
  try {
    const config = getSystemConfig();
    const storedPassword = config.admin?.password;

    if (!storedPassword) {
      console.error('[Auth] Admin password not configured in config.json');
      return false;
    }

    // 检查是否是 bcrypt 哈希（以 $2a$, $2b$, $2y$ 开头）
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(storedPassword);

    if (isBcryptHash) {
      // 使用 bcrypt 验证哈希
      return await bcrypt.compare(password, storedPassword);
    } else {
      // 明文密码对比（开发环境）
      return password === storedPassword;
    }
  } catch (error) {
    console.error('[Auth] Password verification error:', error);
    return false;
  }
}

/**
 * 生成 Session Token (JWT)
 * @returns JWT token 字符串
 */
export async function generateSessionToken(): Promise<string> {
  const sessionTimeout = getSessionTimeout();

  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${sessionTimeout}m`) // 使用配置的超时时间
    .sign(JWT_SECRET);

  return token;
}

/**
 * 验证 Session Token (JWT)
 * @param token - JWT token 字符串
 * @returns 是否有效
 */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch (error) {
    // Token 过期或无效
    return false;
  }
}

/**
 * 从 Cookie 中提取 Session Token
 * @param cookieHeader - Cookie 头字符串
 * @returns Session token 或 null
 */
export function extractTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * 生成密码哈希（用于生成配置中的密码）
 * @param password - 明文密码
 * @returns bcrypt 哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}
