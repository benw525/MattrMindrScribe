import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { isR2Url, getR2KeyFromUrl, getR2PublicUrl } from './r2.js';
import authRoutes from './routes/auth.js';
import transcriptRoutes from './routes/transcripts.js';
import folderRoutes from './routes/folders.js';
import { authenticateToken } from './middleware/auth.js';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
const PORT = isProduction ? 5000 : 3000;


app.use(cors({
  origin: true,
  credentials: true,
}));


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

const mediaTokens = new Map<string, { userId: string; filename: string; expires: number; isR2: boolean }>();

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

  const token = crypto.randomBytes(32).toString('hex');

  if (isR2Url(filename)) {
    const r2Key = getR2KeyFromUrl(filename);
    mediaTokens.set(token, {
      userId: req.userId,
      filename: r2Key,
      expires: Date.now() + 60 * 60 * 1000,
      isR2: true,
    });
  } else {
    mediaTokens.set(token, {
      userId: req.userId,
      filename: path.basename(filename),
      expires: Date.now() + 60 * 60 * 1000,
      isR2: false,
    });
  }

  const mediaFilename = isR2Url(filename) ? encodeURIComponent(getR2KeyFromUrl(filename)) : path.basename(filename);
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

  if (entry.isR2) {
    try {
      const { streamFromR2 } = await import('./r2.js');
      await streamFromR2(entry.filename, res);
    } catch (err: any) {
      console.error('[Media] R2 stream error:', err.message);
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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  const indexPath = path.join(distPath, 'index.html');
  app.use(express.static(distPath));
  app.get('/{*splat}', (_req, res) => {
    if (fs.existsSync(indexPath)) {
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
});
server.timeout = 30 * 60 * 1000;
server.requestTimeout = 30 * 60 * 1000;
