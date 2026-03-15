import { Router, Response, Request } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import pool from '../db.js';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { externalAuthSchema, externalReceiveSchema } from '../validation/schemas.js';
import { processTranscription } from '../transcription.js';
import { s3Configured, uploadFileToS3 } from '../s3.js';

const router = Router();

const uploadsDir = path.join(process.cwd(), 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.webm', '.wma', '.amr', '.opus', '.aiff', '.aif',
  '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.3gp', '.3g2', '.m4v', '.mpg', '.mpeg',
];

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.3gp', '.3g2', '.m4v', '.mpg', '.mpeg', '.webm'];

function validateExternalUrl(urlStr: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return 'Invalid URL format';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Only http and https URLs are allowed';
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return 'localhost URLs are not allowed';
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return 'Internal hostnames are not allowed';
  }

  const parts = hostname.split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const octets = parts.map(Number);
    if (octets[0] === 10) return 'Private IP addresses are not allowed';
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return 'Private IP addresses are not allowed';
    if (octets[0] === 192 && octets[1] === 168) return 'Private IP addresses are not allowed';
    if (octets[0] === 169 && octets[1] === 254) return 'Link-local addresses are not allowed';
  }

  return null;
}

router.post('/auth', validate(externalAuthSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      'SELECT id, email, password_hash, full_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
    });
  } catch (err: any) {
    console.error('[External Auth] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/receive', authenticateToken, validate(externalReceiveSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { filename, fileUrl, contentType, fileSize, description, caseId, caseName, expectedSpeakers } = req.body;

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    let folderId: string | null = null;
    if (caseId) {
      const folderResult = await pool.query(
        'SELECT id FROM folders WHERE mattrmindr_case_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1',
        [caseId, req.userId]
      );

      if (folderResult.rows.length > 0) {
        folderId = folderResult.rows[0].id;
      } else {
        const folderName = caseName || `MattrMindr Case`;
        const newFolder = await pool.query(
          `INSERT INTO folders (name, case_number, user_id, mattrmindr_case_id, mattrmindr_case_name)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [folderName, caseId, req.userId, caseId, folderName]
        );
        folderId = newFolder.rows[0].id;
      }
    }

    const urlError = validateExternalUrl(fileUrl);
    if (urlError) {
      return res.status(400).json({ error: urlError });
    }

    if (fileSize && fileSize > MAX_DOWNLOAD_SIZE) {
      return res.status(400).json({ error: 'File too large. Maximum size is 2GB.' });
    }

    console.log(`[External Receive] Downloading file from: ${fileUrl.substring(0, 80)}...`);

    let downloadRes: globalThis.Response;
    try {
      downloadRes = await fetch(fileUrl);
    } catch (err: any) {
      return res.status(502).json({ error: 'Could not download file from the provided URL' });
    }

    if (!downloadRes.ok) {
      return res.status(502).json({ error: `File download failed with status ${downloadRes.status}` });
    }

    const clHeader = downloadRes.headers.get('content-length');
    if (clHeader && parseInt(clHeader) > MAX_DOWNLOAD_SIZE) {
      return res.status(400).json({ error: 'File too large. Maximum size is 2GB.' });
    }

    const tempFilename = `${uuidv4()}${ext}`;
    const tempPath = path.join(uploadsDir, tempFilename);
    let downloadedSize = 0;

    try {
      const body = downloadRes.body;
      if (!body) {
        return res.status(502).json({ error: 'Empty response body from file URL' });
      }

      const nodeStream = Readable.fromWeb(body as any);
      const writeStream = createWriteStream(tempPath);

      nodeStream.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        if (downloadedSize > MAX_DOWNLOAD_SIZE) {
          nodeStream.destroy(new Error('File exceeds maximum size'));
          return;
        }
        writeStream.write(chunk);
      });

      await new Promise<void>((resolve, reject) => {
        nodeStream.on('end', () => {
          writeStream.end(() => resolve());
        });
        nodeStream.on('error', reject);
        writeStream.on('error', reject);
      });

      if (downloadedSize > MAX_DOWNLOAD_SIZE) {
        await fs.unlink(tempPath).catch(() => {});
        return res.status(400).json({ error: 'File too large. Maximum size is 2GB.' });
      }
    } catch (err: any) {
      await fs.unlink(tempPath).catch(() => {});
      return res.status(502).json({ error: 'Failed to download file' });
    }

    let storedFileUrl: string;
    const fileType = (contentType && contentType.startsWith('video/')) || VIDEO_EXTENSIONS.includes(ext) ? 'video' : 'audio';
    const actualFileSize = fileSize || downloadedSize;

    if (s3Configured) {
      const s3Key = `uploads/${uuidv4()}${ext}`;
      try {
        storedFileUrl = await uploadFileToS3(tempPath, s3Key, contentType || 'application/octet-stream');
      } finally {
        await fs.unlink(tempPath).catch(() => {});
      }
    } else {
      storedFileUrl = `/uploads/${tempFilename}`;
    }

    const speakerCount = expectedSpeakers && parseInt(expectedSpeakers) >= 2 && parseInt(expectedSpeakers) <= 10
      ? parseInt(expectedSpeakers)
      : null;

    const result = await pool.query(
      `INSERT INTO transcripts (filename, description, status, type, file_size, file_url, folder_id, user_id, expected_speakers)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [filename, description || '', fileType, actualFileSize, storedFileUrl, folderId, req.userId, speakerCount]
    );

    const t = result.rows[0];
    console.log(`[External Receive] Transcript created: ${t.id} — ${filename}`);

    processTranscription(t.id).catch(err => {
      console.error('[External Receive] Background transcription failed:', err.message);
    });

    res.status(201).json({
      transcriptId: t.id,
      filename: t.filename,
      status: t.status,
      folderId: folderId,
      message: 'File received and transcription started',
    });
  } catch (err: any) {
    console.error('[External Receive] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/transcripts/:id/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT t.id, t.filename, t.status, t.duration, t.error_message, t.pipeline_log,
        COALESCE(json_agg(
          json_build_object('startTime', s.start_time, 'endTime', s.end_time, 'speaker', s.speaker, 'text', s.text)
          ORDER BY s.segment_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') as segments
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL
      GROUP BY t.id`,
      [id, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const t = rows[0];
    res.json({
      transcriptId: t.id,
      filename: t.filename,
      status: t.status,
      duration: t.duration,
      errorMessage: t.error_message,
      pipelineLog: t.pipeline_log,
      segments: t.status === 'completed' ? t.segments : [],
    });
  } catch (err: any) {
    console.error('[External Status] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
