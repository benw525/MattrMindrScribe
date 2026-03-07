import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { processTranscription, deduplicateExistingSegments } from '../transcription.js';
import { r2Configured, uploadFileToR2, deleteFromR2, isR2Url, getR2KeyFromUrl, getPresignedUploadUrl } from '../r2.js';
import { LEGAL_AGENTS, getAgentById } from '../legalAgents.js';
import OpenAI from 'openai';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';

const router = Router();

const uploadsDir = path.join(process.cwd(), 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac',
  'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac',
  'audio/amr', 'audio/3gpp', 'audio/3gpp2',
  'audio/x-ms-wma', 'audio/vnd.wave', 'audio/opus',
  'audio/aiff', 'audio/x-aiff', 'audio/basic',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg',
  'video/x-matroska', 'video/x-ms-wmv', 'video/x-flv', 'video/3gpp', 'video/3gpp2',
  'video/mp2t', 'video/x-m4v', 'video/mpeg', 'video/x-mpeg',
];
const ALLOWED_EXTENSIONS = [
  '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.wma', '.amr', '.opus', '.aiff', '.aif', '.au', '.ra', '.ram',
  '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.3gp', '.3g2', '.m4v', '.mpg', '.mpeg', '.ts', '.mts', '.vob', '.ogv',
];

const upload = multer({
  storage,
  limits: { fileSize: r2Configured ? 2 * 1024 * 1024 * 1024 : 500 * 1024 * 1024 },
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

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
const pendingUploads = new Map<string, { userId: string; r2Key: string; filename: string; contentType: string; fileSize: number; expires: number }>();

router.post('/presigned-upload', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!r2Configured) {
      return res.status(400).json({ error: 'Direct upload not available. R2 storage is not configured.' });
    }

    const { filename, contentType, fileSize } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type. Only audio and video files are allowed.' });
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'File too large. Maximum size is 2GB.' });
    }

    const r2Key = `uploads/${uuidv4()}${ext}`;
    const uploadToken = uuidv4();

    pendingUploads.set(uploadToken, {
      userId: req.userId!,
      r2Key,
      filename,
      contentType,
      fileSize: fileSize || 0,
      expires: Date.now() + 3600 * 1000,
    });

    const presignedUrl = await getPresignedUploadUrl(r2Key, contentType);

    res.json({ presignedUrl, r2Key, contentType, uploadToken });
  } catch (err: any) {
    console.error('[Presigned Upload] Error generating URL:', err.message);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

router.post('/confirm-upload', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uploadToken, description, folderId } = req.body;
    if (!uploadToken) {
      return res.status(400).json({ error: 'uploadToken is required' });
    }

    const pending = pendingUploads.get(uploadToken);
    if (!pending) {
      return res.status(400).json({ error: 'Invalid or expired upload token' });
    }

    if (pending.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (pending.expires < Date.now()) {
      pendingUploads.delete(uploadToken);
      return res.status(400).json({ error: 'Upload token expired' });
    }

    pendingUploads.delete(uploadToken);

    const fileUrl = `r2://${pending.r2Key}`;
    const fileType = pending.contentType.startsWith('video/') ? 'video' : 'audio';

    const result = await pool.query(
      `INSERT INTO transcripts (filename, description, status, type, file_size, file_url, folder_id, user_id)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        pending.filename,
        description || '',
        fileType,
        pending.fileSize,
        fileUrl,
        folderId || null,
        req.userId,
      ]
    );

    const t = result.rows[0];
    console.log('[Confirm Upload] Transcript created:', t.id, pending.filename);

    processTranscription(t.id).catch(err => {
      console.error('Background transcription failed:', err.message);
    });

    res.status(201).json({
      id: t.id,
      filename: t.filename,
      description: t.description,
      status: t.status,
      type: t.type,
      fileSize: t.file_size,
      fileUrl: t.file_url,
      folderId: t.folder_id,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (err: any) {
    console.error('[Confirm Upload] Error:', err.message);
    res.status(500).json({ error: 'Failed to create transcript record' });
  }
});

router.post('/upload', (req, res: Response, next) => {
  console.log('[Upload] Request received (legacy)');
  req.setTimeout(30 * 60 * 1000);
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      console.error('[Upload] Multer error:', err.message, err.code);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      console.log('[Upload] No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    console.log('[Upload] File received:', req.file.originalname, req.file.size, 'bytes');

    const { description, folderId } = req.body;
    const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'audio';

    let fileUrl: string;
    const diskPath = req.file.path;

    if (r2Configured) {
      const ext = path.extname(req.file.originalname);
      const r2Key = `uploads/${uuidv4()}${ext}`;
      try {
        fileUrl = await uploadFileToR2(diskPath, r2Key, req.file.mimetype);
      } finally {
        await fs.unlink(diskPath).catch(() => {});
      }
    } else {
      fileUrl = `/uploads/${req.file.filename}`;
    }

    const result = await pool.query(
      `INSERT INTO transcripts (filename, description, status, type, file_size, file_url, folder_id, user_id)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.file.originalname,
        description || '',
        fileType,
        req.file.size,
        fileUrl,
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

router.post('/:id/deduplicate', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(
      'SELECT id FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const removed = await deduplicateExistingSegments(id);

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
      removed,
      transcript: {
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
      }
    });
  } catch (err) {
    console.error('Deduplicate error:', err);
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

    const fileResults = await pool.query(
      `SELECT file_url FROM transcripts WHERE id IN (${placeholders}) AND user_id = $${ids.length + 1}`,
      [...ids, req.userId]
    );

    await pool.query(
      `DELETE FROM transcripts WHERE id IN (${placeholders}) AND user_id = $${ids.length + 1}`,
      [...ids, req.userId]
    );

    for (const row of fileResults.rows) {
      if (row.file_url && isR2Url(row.file_url)) {
        deleteFromR2(getR2KeyFromUrl(row.file_url)).catch(() => {});
      } else if (row.file_url) {
        try {
          const localPath = path.join(process.cwd(), row.file_url.startsWith('/') ? row.file_url.slice(1) : row.file_url);
          const fsModule = await import('fs');
          if (fsModule.existsSync(localPath)) fsModule.unlinkSync(localPath);
        } catch {}
      }
    }

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

const aiClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

router.get('/agents', (_req: AuthRequest, res: Response) => {
  const agents = LEGAL_AGENTS.map(({ id, name, icon, description }) => ({ id, name, icon, description }));
  res.json(agents);
});

router.post('/:id/summarize', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { agentType } = req.body;

    if (!agentType) {
      return res.status(400).json({ error: 'agentType is required' });
    }

    const agent = getAgentById(agentType);
    if (!agent) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const existing = await pool.query(
      'SELECT id FROM transcripts WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const segmentsResult = await pool.query(
      `SELECT speaker, text, start_time, end_time
       FROM transcript_segments WHERE transcript_id = $1 ORDER BY segment_order`,
      [id]
    );

    if (segmentsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Transcript has no segments to summarize' });
    }

    const transcriptText = segmentsResult.rows.map(seg => {
      const startMin = Math.floor(seg.start_time / 60);
      const startSec = Math.floor(seg.start_time % 60);
      const timestamp = `[${startMin}:${startSec.toString().padStart(2, '0')}]`;
      return `${timestamp} ${seg.speaker}: ${seg.text}`;
    }).join('\n');

    const MAX_CHARS = 120000;
    if (transcriptText.length > MAX_CHARS) {
      return res.status(400).json({ error: `Transcript is too long for summarization (${Math.round(transcriptText.length / 1000)}k chars). Maximum is ${MAX_CHARS / 1000}k characters.` });
    }

    const model = 'gpt-4o-mini';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const abortController = new AbortController();
    let clientDisconnected = false;

    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
    });

    const stream = await aiClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: `Please analyze and summarize the following legal transcript:\n\n${transcriptText}` },
      ],
      stream: true,
      max_tokens: 4096,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (clientDisconnected) break;
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        try {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        } catch { break; }
      }
    }

    if (!clientDisconnected && fullResponse) {
      const summaryResult = await pool.query(
        `INSERT INTO transcript_summaries (transcript_id, user_id, agent_type, summary, model_used)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, req.userId, agentType, fullResponse, model]
      );

      const s = summaryResult.rows[0];
      try {
        res.write(`data: ${JSON.stringify({ done: true, summary: { id: s.id, agentType: s.agent_type, summary: s.summary, modelUsed: s.model_used, createdAt: s.created_at } })}\n\n`);
      } catch {}
    }
    res.end();
  } catch (err: any) {
    console.error('Summarize error:', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message || 'Summary generation failed' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to generate summary' });
    }
  }
});

router.get('/:id/summaries', async (req: AuthRequest, res: Response) => {
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
      'SELECT * FROM transcript_summaries WHERE transcript_id = $1 ORDER BY created_at DESC',
      [id]
    );

    const summaries = result.rows.map(s => ({
      id: s.id,
      agentType: s.agent_type,
      summary: s.summary,
      modelUsed: s.model_used,
      createdAt: s.created_at,
    }));

    res.json(summaries);
  } catch (err) {
    console.error('Get summaries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
