import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface AuthRequest extends Request {
  userId?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    const isExternalRoute = req.path.startsWith('/api/external/') || req.originalUrl.startsWith('/api/external/');
    if (isExternalRoute) {
      const authHeader = req.headers['authorization'];
      token = authHeader && authHeader.split(' ')[1] || undefined;
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

export function setAuthCookies(res: Response, token: string, csrfToken: string) {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('auth_token', { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
}

export function csrfProtection(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  if (req.path.startsWith('/api/external/') || req.originalUrl.startsWith('/api/external/')) {
    return next();
  }

  const unauthPaths = ['/api/auth/login', '/api/auth/register'];
  const checkPath = req.originalUrl.split('?')[0];
  if (unauthPaths.includes(checkPath) || unauthPaths.includes(req.path)) {
    return next();
  }

  const csrfCookie = req.cookies?.csrf_token;
  const csrfHeader = req.headers['x-csrf-token'];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  next();
}
