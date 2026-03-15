import { Request, Response, NextFunction } from 'express';

export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers['x-admin-key'] as string | undefined;

  if (!adminKey || !providedKey || providedKey !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
