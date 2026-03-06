import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { processTranscription } from '../transcription.js';

const router = Router();

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
  'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg',
];
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.mp4', '.mov', '.avi'];

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_TYPES.includes(file.mimetype) || ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio and video files are allowed.'));
    }
  },
});

router.use(authenticateToken);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT t.*, 
        COALESCE(json_agg(
          json_build_object('id', s.id, 'startTime', s.start_time, 'endTime', s.end_time, 'speaker', s.speaker, 'text', s.text)
          ORDER BY s.segment_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') as segments
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.user_id = $1
      GROUP BY t.id
      ORDER BY t.created_at DESC`,
      [req.userId]
    );

    const transcripts = result.rows.map(row => ({
      id: row.id,
      filename: row.filename,
      description: row.description,
      status: row.status,
      type: row.type,
      duration: row.duration,
      fileSize: row.file_size,
      fileUrl: row.file_url,
      folderId: row.folder_id,
      errorMessage: row.error_message,
      segments: row.segments,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(transcripts);
  } catch (err) {
    console.error('Get transcripts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { description, folderId } = req.body;
    const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'audio';

    const result = await pool.query(
      `INSERT INTO transcripts (filename, description, status, type, file_size, file_url, folder_id, user_id)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.file.originalname,
        description || '',
        fileType,
        req.file.size,
        `/uploads/${req.file.filename}`,
        folderId || null,
        req.userId,
      ]
    );

    const t = result.rows[0];

    processTranscription(t.id).catch(err => {
      console.error('Background transcription failed:', err.message);
    });

    res.status(201).json({
      id: t.id,
      filename: t.filename,
      description: t.description,
      status: t.status,
      type: t.type,
      duration: t.duration,
      fileSize: t.file_size,
      fileUrl: t.file_url,
      folderId: t.folder_id,
      errorMessage: t.error_message,
      segments: [],
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { filename, description, status, folderId, segments, speakers } = req.body;

    const existing = await pool.query(
      'SELECT id FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filename !== undefined) { updates.push(`filename = $${paramCount++}`); values.push(filename); }
    if (description !== undefined) { updates.push(`description = $${paramCount++}`); values.push(description); }
    if (status !== undefined) { updates.push(`status = $${paramCount++}`); values.push(status); }
    if (folderId !== undefined) { updates.push(`folder_id = $${paramCount++}`); values.push(folderId); }
    updates.push(`updated_at = NOW()`);

    if (updates.length > 1) {
      await pool.query(
        `UPDATE transcripts SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount}`,
        [...values, id, req.userId]
      );
    }

    if (segments !== undefined) {
      await pool.query('DELETE FROM transcript_segments WHERE transcript_id = $1', [id]);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        await pool.query(
          `INSERT INTO transcript_segments (transcript_id, start_time, end_time, speaker, text, segment_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, seg.startTime, seg.endTime, seg.speaker, seg.text, i]
        );
      }
    }

    if (speakers !== undefined) {
      for (const [oldName, newName] of Object.entries(speakers)) {
        await pool.query(
          'UPDATE transcript_segments SET speaker = $1 WHERE transcript_id = $2 AND speaker = $3',
          [newName, id, oldName]
        );
      }
    }

    const result = await pool.query(
      `SELECT t.*,
        COALESCE(json_agg(
          json_build_object('id', s.id, 'startTime', s.start_time, 'endTime', s.end_time, 'speaker', s.speaker, 'text', s.text)
          ORDER BY s.segment_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') as segments
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.id = $1
      GROUP BY t.id`,
      [id]
    );

    const t = result.rows[0];
    res.json({
      id: t.id,
      filename: t.filename,
      description: t.description,
      status: t.status,
      type: t.type,
      duration: t.duration,
      fileSize: t.file_size,
      fileUrl: t.file_url,
      folderId: t.folder_id,
      errorMessage: t.error_message,
      segments: t.segments,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (err) {
    console.error('Update transcript error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT status, error_message, duration FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    const row = result.rows[0];
    res.json({
      status: row.status,
      errorMessage: row.error_message,
      duration: row.duration,
    });
  } catch (err) {
    console.error('Get status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/retranscribe', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(
      'SELECT id, file_url FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    await pool.query(
      `UPDATE transcripts SET status = 'pending', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    processTranscription(id).catch(err => {
      console.error('Re-transcription failed:', err.message);
    });

    res.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('Retranscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of transcript IDs required' });
    }

    const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(', ');
    await pool.query(
      `DELETE FROM transcripts WHERE id IN (${placeholders}) AND user_id = $${ids.length + 1}`,
      [...ids, req.userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Delete transcripts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/versions', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { changeDescription } = req.body;

    const existing = await pool.query(
      'SELECT id FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const segmentsResult = await pool.query(
      `SELECT id, start_time as "startTime", end_time as "endTime", speaker, text
       FROM transcript_segments WHERE transcript_id = $1 ORDER BY segment_order`,
      [id]
    );

    const result = await pool.query(
      `INSERT INTO transcript_versions (transcript_id, segments, change_description)
       VALUES ($1, $2, $3) RETURNING *`,
      [id, JSON.stringify(segmentsResult.rows), changeDescription || '']
    );

    const v = result.rows[0];
    res.status(201).json({
      id: v.id,
      createdAt: v.created_at,
      segments: v.segments,
      changeDescription: v.change_description,
    });
  } catch (err) {
    console.error('Create version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/versions', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      'SELECT id FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const result = await pool.query(
      'SELECT * FROM transcript_versions WHERE transcript_id = $1 ORDER BY created_at DESC',
      [id]
    );

    const versions = result.rows.map(v => ({
      id: v.id,
      createdAt: v.created_at,
      segments: v.segments,
      changeDescription: v.change_description,
    }));

    res.json(versions);
  } catch (err) {
    console.error('Get versions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
