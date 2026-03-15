import { Router, Response } from 'express';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT * FROM folders WHERE user_id = $1 ORDER BY name ASC',
      [req.userId]
    );

    const folders = result.rows.map(f => ({
      id: f.id,
      name: f.name,
      caseNumber: f.case_number,
      parentId: f.parent_id,
      mattrmindrCaseId: f.mattrmindr_case_id || null,
      mattrmindrCaseName: f.mattrmindr_case_name || null,
    }));

    res.json(folders);
  } catch (err) {
    console.error('Get folders error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, caseNumber, parentId, mattrmindrCaseId, mattrmindrCaseName } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const result = await pool.query(
      `INSERT INTO folders (name, case_number, parent_id, user_id, mattrmindr_case_id, mattrmindr_case_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, caseNumber || null, parentId || null, req.userId, mattrmindrCaseId || null, mattrmindrCaseName || null]
    );

    const f = result.rows[0];
    res.status(201).json({
      id: f.id,
      name: f.name,
      caseNumber: f.case_number,
      parentId: f.parent_id,
      mattrmindrCaseId: f.mattrmindr_case_id || null,
      mattrmindrCaseName: f.mattrmindr_case_name || null,
    });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, caseNumber } = req.body;

    const result = await pool.query(
      `UPDATE folders SET name = COALESCE($1, name), case_number = COALESCE($2, case_number), updated_at = NOW()
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [name, caseNumber, id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const f = result.rows[0];
    res.json({
      id: f.id,
      name: f.name,
      caseNumber: f.case_number,
      parentId: f.parent_id,
      mattrmindrCaseId: f.mattrmindr_case_id || null,
      mattrmindrCaseName: f.mattrmindr_case_name || null,
    });
  } catch (err) {
    console.error('Update folder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await pool.query(
      'UPDATE transcripts SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2',
      [id, req.userId]
    );

    const result = await pool.query(
      'DELETE FROM folders WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete folder error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/move-transcripts', async (req: AuthRequest, res: Response) => {
  try {
    const { transcriptIds, folderId } = req.body;

    if (!transcriptIds || !Array.isArray(transcriptIds)) {
      return res.status(400).json({ error: 'Array of transcript IDs required' });
    }

    const placeholders = transcriptIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
    await pool.query(
      `UPDATE transcripts SET folder_id = $${transcriptIds.length + 1}, updated_at = NOW()
       WHERE id IN (${placeholders}) AND user_id = $${transcriptIds.length + 2}`,
      [...transcriptIds, folderId || null, req.userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Move transcripts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
