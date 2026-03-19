import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface AuthRequest extends Request {
  userId?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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

let _apiKeyUserId: string | null = null;
let _resolvePromise: Promise<string | null> | null = null;

async function resolveApiKeyUser(): Promise<string | null> {
  if (_apiKeyUserId) return _apiKeyUserId;

  if (_resolvePromise) return _resolvePromise;

  _resolvePromise = (async () => {
    const apiKey = process.env.EXTERNAL_API_KEY;
    const email = process.env.EXTERNAL_API_USER_EMAIL;
    if (!apiKey || !email) return null;

    try {
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (rows.length > 0) {
        _apiKeyUserId = rows[0].id;
        console.log(`[Auth] External API key mapped to user: ${email}`);
        return _apiKeyUserId;
      } else {
        console.error(`[Auth] EXTERNAL_API_USER_EMAIL user not found: ${email}`);
      }
    } catch (err: any) {
      console.error(`[Auth] Failed to resolve API key user:`, err.message);
    }
    _resolvePromise = null;
    return null;
  })();

  return _resolvePromise;
}

export async function authenticateApiKeyOrToken(req: AuthRequest, res: Response, next: NextFunction) {
  const configuredKey = process.env.EXTERNAL_API_KEY;
  if (!configuredKey) {
    return authenticateToken(req, res, next);
  }

  const xApiKey = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  const candidateKey = xApiKey || bearerToken;

  if (candidateKey) {
    if (candidateKey === configuredKey) {
      const userId = await resolveApiKeyUser();
      if (userId) {
        req.userId = userId;
        return next();
      }
      return res.status(500).json({ error: 'API key user not configured' });
    }

    if (xApiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    return authenticateToken(req, res, next);
  }

  return res.status(401).json({ error: 'Authentication required' });
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}
