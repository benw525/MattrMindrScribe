import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { isCloudStorageUrl, getKeyFromStorageUrl, getS3PublicUrl, getPresignedDownloadUrl } from './s3.js';
import authRoutes from './routes/auth.js';
import transcriptRoutes from './routes/transcripts.js';
import folderRoutes from './routes/folders.js';
import mattrmindrRoutes from './routes/mattrmindr.js';
import externalRoutes from './routes/external.js';
import { authenticateToken, csrfProtection } from './middleware/auth.js';
import pool from './db.js';
import { deduplicateExistingSegments, processTranscription } from './transcription.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
const PORT = isProduction ? 5000 : 3000;

const allowedOrigins: string[] = [];
if (process.env.ALLOWED_ORIGINS) {
  allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean));
}
if (allowedOrigins.length === 0) {
  if (isProduction) {
    allowedOrigins.push('https://scribe.mattrmindr.com', 'http://scribe.mattrmindr.com');
  } else {
    allowedOrigins.push('http://localhost:5000', 'http://localhost:3000');
    if (process.env.REPLIT_DEV_DOMAIN) {
      allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      for (const domain of process.env.REPLIT_DOMAINS.split(',')) {
        allowedOrigins.push(`https://${domain.trim()}`);
      }
    }
  }
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(csrfProtection as any);


app.get('/', (_req, res, next) => {
  if (isProduction) {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return res.json({ status: 'ok' });
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', authenticateToken as any, express.static(path.join(__dirname, '..', 'uploads')));

const mediaTokens = new Map<string, { userId: string; filename: string; expires: number; isCloudStorage: boolean }>();

app.post('/api/media/token', authenticateToken as any, async (req: any, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Filename required' });

  const { rows } = await pool.query(
    'SELECT id FROM transcripts WHERE file_url = $1 AND user_id = $2 LIMIT 1',
    [filename, req.userId]
  );
  if (rows.length === 0) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (isCloudStorageUrl(filename)) {
    try {
      const storageKey = getKeyFromStorageUrl(filename);
      const presignedUrl = await getPresignedDownloadUrl(storageKey);
      return res.json({ mediaUrl: presignedUrl });
    } catch (err: any) {
      console.error('[Media] Presigned download URL error:', err.message);
      return res.status(500).json({ error: 'Failed to generate media URL' });
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  mediaTokens.set(token, {
    userId: req.userId,
    filename: path.basename(filename),
    expires: Date.now() + 60 * 60 * 1000,
    isCloudStorage: false,
  });

  const mediaFilename = path.basename(filename);
  res.json({ token, mediaFilename });
});

app.get('/api/media/:filename', async (req, res) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: 'Token required' });
  const entry = mediaTokens.get(token);
  if (!entry || entry.expires < Date.now()) {
    mediaTokens.delete(token);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const requestedFile = decodeURIComponent(req.params.filename);

  if (entry.filename !== requestedFile) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (entry.isCloudStorage) {
    try {
      const { streamFromS3 } = await import('./s3.js');
      await streamFromS3(entry.filename, res);
    } catch (err: any) {
      console.error('[Media] S3 stream error:', err.message);
      return res.status(500).json({ error: 'Failed to stream file' });
    }
  } else {
    const filePath = path.resolve(__dirname, '..', 'uploads', requestedFile);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/mattrmindr', mattrmindrRoutes);
app.use('/api/external', externalRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  const indexPath = path.join(distPath, 'index.html');
  app.use(express.static(distPath, {
    maxAge: '1y',
    immutable: true,
    index: false,
  }));
  app.get('/{*splat}', (_req, res) => {
    if (fs.existsSync(indexPath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(indexPath);
    } else {
      res.status(503).send('Application is starting up...');
    }
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS transcript_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_id UUID NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_type VARCHAR(100) NOT NULL,
    sub_type VARCHAR(100) DEFAULT NULL,
    summary TEXT NOT NULL,
    model_used VARCHAR(100) DEFAULT 'gpt-5-mini',
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_summaries_transcript ON transcript_summaries(transcript_id);
`).catch((err: any) => console.error('Migration error:', err.message));

pool.query(`
  ALTER TABLE transcript_summaries ADD COLUMN IF NOT EXISTS sub_type VARCHAR(100) DEFAULT NULL;
`).catch((err: any) => {});

pool.query(`
  ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS expected_speakers INTEGER DEFAULT NULL;
  ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS pipeline_log JSONB DEFAULT NULL;
`).catch((err: any) => {
  if (!err.message.includes('already exists')) console.error('Migration error:', err.message);
});

pool.query(`
  CREATE TABLE IF NOT EXISTS mattrmindr_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    base_url TEXT NOT NULL,
    email VARCHAR(255) NOT NULL,
    auth_token TEXT NOT NULL,
    connected_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
  );
`).catch((err: any) => console.error('Migration error (mattrmindr_connections):', err.message));

pool.query(`
  ALTER TABLE folders ADD COLUMN IF NOT EXISTS mattrmindr_case_id VARCHAR(255) DEFAULT NULL;
  ALTER TABLE folders ADD COLUMN IF NOT EXISTS mattrmindr_case_name VARCHAR(255) DEFAULT NULL;
`).catch((err: any) => {
  if (!err.message.includes('already exists')) console.error('Migration error (folders mattrmindr):', err.message);
});

pool.query(`
  ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS recording_type VARCHAR(50) DEFAULT NULL;
  ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS practice_area VARCHAR(100) DEFAULT NULL;
`).catch((err: any) => {
  if (!err.message.includes('already exists')) console.error('Migration error (transcripts recording_type/practice_area):', err.message);
});

async function seedAdminAccounts() {
  const raw = process.env.ADMIN_ACCOUNTS;
  if (!raw) return;
  let accounts: { email: string; password: string; fullName: string }[];
  try { accounts = JSON.parse(raw); } catch { return; }
  for (const acct of accounts) {
    try {
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [acct.email.toLowerCase()]);
      if (rows.length === 0) {
        const hash = await bcrypt.hash(acct.password, 12);
        await pool.query(
          `INSERT INTO users (id, email, password_hash, full_name, role, subscription_tier, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'admin', 'unlimited', NOW(), NOW())`,
          [acct.email.toLowerCase(), hash, acct.fullName]
        );
        console.log(`[Seed] Created admin account: ${acct.email}`);
      } else {
        await pool.query(
          `UPDATE users SET role = 'admin', subscription_tier = 'unlimited', updated_at = NOW() WHERE email = $1`,
          [acct.email.toLowerCase()]
        );
      }
    } catch (err: any) {
      console.error(`[Seed] Error for ${acct.email}:`, err.message);
    }
  }
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  seedAdminAccounts();
});
server.timeout = 30 * 60 * 1000;
server.requestTimeout = 30 * 60 * 1000;

const serverBootTime = new Date().toISOString();

setTimeout(async () => {
  try {
    const tmpDir = os.tmpdir();
    const entries = fs.readdirSync(tmpDir);
    const orphaned = entries.filter(e => e.startsWith('s3_download_') || e.startsWith('transcription_'));
    let cleaned = 0;
    for (const entry of orphaned) {
      try {
        fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
        cleaned++;
      } catch {}
    }
    if (cleaned > 0) {
      console.log(`[Startup Cleanup] Removed ${cleaned} orphaned temp director${cleaned === 1 ? 'y' : 'ies'}`);
    }
  } catch (err: any) {
    console.error('[Startup Cleanup] Error scanning temp directory:', err.message);
  }

  try {
    const { rows: stuck } = await pool.query(
      `SELECT t.id, t.filename, t.pipeline_log,
        (SELECT COUNT(*) FROM transcript_segments s WHERE s.transcript_id = t.id) as seg_count
       FROM transcripts t
       WHERE t.status IN ('processing', 'resuming') AND t.updated_at < $1`,
      [serverBootTime]
    );
    if (stuck.length > 0) {
      console.log(`[Startup Recovery] Found ${stuck.length} interrupted transcript(s) — auto-resuming...`);
      for (let i = 0; i < stuck.length; i++) {
        const t = stuck[i];
        const { rowCount } = await pool.query(
          `UPDATE transcripts SET status = 'resuming', updated_at = NOW() WHERE id = $1 AND status IN ('processing', 'resuming')`,
          [t.id]
        );
        if (rowCount === 0) {
          console.log(`[Startup Recovery] Skipping "${t.filename}" (${t.id}) — already claimed`);
          continue;
        }
        const hasCheckpoint = t.pipeline_log?.whisper?.status === 'success' && parseInt(t.seg_count) > 0;
        console.log(`[Startup Recovery] Auto-resuming transcript: "${t.filename}" (${t.id})${hasCheckpoint ? ' [checkpoint — skipping to refinement]' : ' [restarting from beginning]'}`);
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        processTranscription(t.id).catch(err => {
          console.error(`[Startup Recovery] Auto-resume failed for "${t.filename}" (${t.id}):`, err.message);
        });
      }
    }
  } catch (err: any) {
    console.error('[Startup Recovery] Error:', err.message);
  }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (key VARCHAR(100) PRIMARY KEY, ran_at TIMESTAMP DEFAULT NOW())`);
    const { rows: done } = await pool.query(`SELECT 1 FROM _migrations WHERE key = 'dedup_segments_v1'`);
    if (done.length === 0) {
      const { rows } = await pool.query(
        `SELECT t.id, t.filename, 
          (SELECT COUNT(*) FROM transcript_segments s WHERE s.transcript_id = t.id) as seg_count
         FROM transcripts t WHERE t.status = 'completed'`
      );
      let fixed = 0;
      for (const row of rows) {
        if (parseInt(row.seg_count) > 200) {
          const removed = await deduplicateExistingSegments(row.id);
          if (removed > 0) {
            console.log(`[Startup Dedup] "${row.filename}": removed ${removed} duplicate segments`);
            fixed++;
          }
        }
      }
      await pool.query(`INSERT INTO _migrations (key) VALUES ('dedup_segments_v1')`);
      if (fixed > 0) console.log(`[Startup Dedup] Completed — fixed ${fixed} transcript(s)`);
    }
  } catch (err: any) {
    console.error('[Startup Dedup] Error:', err.message);
  }

  try {
    const { rows: done2 } = await pool.query(`SELECT 1 FROM _migrations WHERE key = 'dedup_segments_v2'`);
    if (done2.length === 0) {
      console.log('[Startup Dedup v2] Cleaning duplicate segment_order rows...');
      await pool.query(`
        DELETE FROM transcript_segments
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY transcript_id, segment_order ORDER BY id) as rn
            FROM transcript_segments
          ) ranked WHERE rn > 1
        )
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_segments_unique_order
        ON transcript_segments (transcript_id, segment_order)
      `);
      await pool.query(`INSERT INTO _migrations (key) VALUES ('dedup_segments_v2')`);
      console.log('[Startup Dedup v2] Done — duplicate rows removed and unique index added');
    }
  } catch (err: any) {
    console.error('[Startup Dedup v2] Error:', err.message);
  }
}, 2000);
