import { Router, Response } from 'express';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { checkAccess } from '../checkAccess.js';

const router = Router();

router.use(authenticateToken as any);

router.post('/', async (req: any, res: Response) => {
  try {
    const { email, resourceType, resourceId, permission } = req.body;

    if (!email || !resourceType || !resourceId || !permission) {
      return res.status(400).json({ error: 'email, resourceType, resourceId, and permission are required' });
    }

    if (!['transcript', 'folder'].includes(resourceType)) {
      return res.status(400).json({ error: 'resourceType must be transcript or folder' });
    }

    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be view or edit' });
    }

    const access = await checkAccess(req.userId, resourceType, resourceId);
    if (access.permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can share this resource' });
    }

    const { rows: userRows } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'No user found with that email address' });
    }

    const sharedWithId = userRows[0].id;

    if (sharedWithId === req.userId) {
      return res.status(400).json({ error: 'You cannot share with yourself' });
    }

    const { rows: existingRows } = await pool.query(
      `SELECT id FROM shares 
       WHERE owner_id = $1 AND shared_with_id = $2 AND resource_type = $3 AND resource_id = $4 AND revoked_at IS NULL`,
      [req.userId, sharedWithId, resourceType, resourceId]
    );

    if (existingRows.length > 0) {
      await pool.query(
        'UPDATE shares SET permission = $1, updated_at = NOW() WHERE id = $2',
        [permission, existingRows[0].id]
      );
      return res.json({ id: existingRows[0].id, updated: true });
    }

    const { rows } = await pool.query(
      `INSERT INTO shares (owner_id, shared_with_id, resource_type, resource_id, permission)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.userId, sharedWithId, resourceType, resourceId, permission]
    );

    res.status(201).json({ id: rows[0].id });
  } catch (err: any) {
    console.error('[Shares] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

router.get('/by-resource', async (req: any, res: Response) => {
  try {
    const { resourceType, resourceId } = req.query;

    if (!resourceType || !resourceId) {
      return res.status(400).json({ error: 'resourceType and resourceId required' });
    }

    const access = await checkAccess(req.userId, resourceType as any, resourceId as string);
    if (access.permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can view shares' });
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.permission, s.created_at, s.updated_at, u.email, u.full_name as name
       FROM shares s
       JOIN users u ON u.id = s.shared_with_id
       WHERE s.owner_id = $1 AND s.resource_type = $2 AND s.resource_id = $3 AND s.revoked_at IS NULL
       ORDER BY s.created_at DESC`,
      [req.userId, resourceType, resourceId]
    );

    res.json(rows);
  } catch (err: any) {
    console.error('[Shares] List error:', err.message);
    res.status(500).json({ error: 'Failed to list shares' });
  }
});

router.get('/shared-with-me', async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id as share_id, s.permission, s.resource_type, s.resource_id, s.created_at,
              u.email as owner_email, u.full_name as owner_name,
              CASE 
                WHEN s.resource_type = 'transcript' THEN t.filename
                WHEN s.resource_type = 'folder' THEN f.name
              END as resource_name,
              CASE
                WHEN s.resource_type = 'transcript' THEN t.type
                ELSE NULL
              END as media_type
       FROM shares s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN transcripts t ON s.resource_type = 'transcript' AND t.id::text = s.resource_id
       LEFT JOIN folders f ON s.resource_type = 'folder' AND f.id::text = s.resource_id
       WHERE s.shared_with_id = $1 AND s.revoked_at IS NULL
       ORDER BY s.created_at DESC`,
      [req.userId]
    );

    res.json(rows);
  } catch (err: any) {
    console.error('[Shares] Shared-with-me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch shared items' });
  }
});

router.patch('/:id', async (req: any, res: Response) => {
  try {
    const { permission } = req.body;

    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be view or edit' });
    }

    const { rows } = await pool.query(
      'SELECT id FROM shares WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL',
      [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await pool.query(
      'UPDATE shares SET permission = $1, updated_at = NOW() WHERE id = $2',
      [permission, req.params.id]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Shares] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update share' });
  }
});

router.delete('/:id', async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT id FROM shares WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL',
      [req.params.id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    await pool.query(
      'UPDATE shares SET revoked_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Shares] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});

export default router;
