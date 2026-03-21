import { Router, Response } from 'express';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { checkAccess } from '../checkAccess.js';

const router = Router();

router.use(authenticateToken);

router.get('/:transcriptId/annotations', async (req: AuthRequest, res: Response) => {
  try {
    const { transcriptId } = req.params;

    const access = await checkAccess(req.userId!, 'transcript', transcriptId);
    if (access.permission === 'none') {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const { rows } = await pool.query(
      `SELECT id, type, segment_id as "segmentId", text, created_at as "createdAt", updated_at as "updatedAt"
       FROM transcript_annotations
       WHERE transcript_id = $1 AND user_id = $2
       ORDER BY created_at`,
      [transcriptId, req.userId]
    );

    res.json(rows);
  } catch (err) {
    console.error('Get annotations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:transcriptId/annotations', async (req: AuthRequest, res: Response) => {
  try {
    const { transcriptId } = req.params;
    const { type, segmentId, text } = req.body;

    if (!type || !segmentId) {
      return res.status(400).json({ error: 'type and segmentId are required' });
    }
    if (!['note', 'bookmark'].includes(type)) {
      return res.status(400).json({ error: 'type must be "note" or "bookmark"' });
    }

    const access = await checkAccess(req.userId!, 'transcript', transcriptId);
    if (access.permission === 'none') {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    if (!access.isOwner && access.permission !== 'edit') {
      return res.status(403).json({ error: 'You do not have edit permission' });
    }

    if (type === 'bookmark') {
      const existing = await pool.query(
        `SELECT id, type, segment_id as "segmentId", text, created_at as "createdAt", updated_at as "updatedAt"
         FROM transcript_annotations
         WHERE transcript_id = $1 AND user_id = $2 AND type = 'bookmark' AND segment_id = $3`,
        [transcriptId, req.userId, segmentId]
      );
      if (existing.rows.length > 0) {
        return res.json(existing.rows[0]);
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO transcript_annotations (transcript_id, user_id, type, segment_id, text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, segment_id as "segmentId", text, created_at as "createdAt", updated_at as "updatedAt"`,
      [transcriptId, req.userId, type, segmentId, text || '']
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create annotation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:transcriptId/annotations/:annotationId', async (req: AuthRequest, res: Response) => {
  try {
    const { transcriptId, annotationId } = req.params;
    const { text } = req.body;

    const access = await checkAccess(req.userId!, 'transcript', transcriptId);
    if (access.permission === 'none') {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    if (!access.isOwner && access.permission !== 'edit') {
      return res.status(403).json({ error: 'You do not have edit permission' });
    }

    const { rows } = await pool.query(
      `UPDATE transcript_annotations SET text = $1, updated_at = NOW()
       WHERE id = $2 AND transcript_id = $3 AND user_id = $4
       RETURNING id, type, segment_id as "segmentId", text, created_at as "createdAt", updated_at as "updatedAt"`,
      [text || '', annotationId, transcriptId, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Update annotation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:transcriptId/annotations/:annotationId', async (req: AuthRequest, res: Response) => {
  try {
    const { transcriptId, annotationId } = req.params;

    const access = await checkAccess(req.userId!, 'transcript', transcriptId);
    if (access.permission === 'none') {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    if (!access.isOwner && access.permission !== 'edit') {
      return res.status(403).json({ error: 'You do not have edit permission' });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM transcript_annotations WHERE id = $1 AND transcript_id = $2 AND user_id = $3',
      [annotationId, transcriptId, req.userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete annotation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
