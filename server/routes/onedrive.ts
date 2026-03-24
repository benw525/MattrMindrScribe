import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth.js';
import pool from '../db.js';
import crypto from 'crypto';
import { uploadFileToS3 } from '../s3.js';
import { processTranscription } from '../transcription.js';
import path from 'path';
import { tmpdir } from 'os';
import { mkdir, rm } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const router = Router();

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI;

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPES = 'Files.Read.All offline_access User.Read';

const MEDIA_EXTENSIONS = /\.(mp3|wav|m4a|ogg|flac|aac|webm|wma|amr|opus|aiff|aif|au|ra|ram|mp4|mov|avi|mkv|wmv|flv|3gp|3g2|m4v|mpg|mpeg|ts|mts|vob|ogv)$/i;

const pendingAuthStates = new Map<string, { userId: string; expires: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingAuthStates) {
    if (val.expires < now) pendingAuthStates.delete(key);
  }
}, 60_000);

function isConfigured(): boolean {
  return !!(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET && MICROSOFT_REDIRECT_URI);
}

async function refreshAccessToken(userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, token_expires_at FROM onedrive_connections WHERE user_id = $1',
    [userId]
  );
  if (rows.length === 0) return null;

  const { access_token, refresh_token, token_expires_at } = rows[0];
  const expiresAt = new Date(token_expires_at).getTime();

  if (Date.now() < expiresAt - 60_000) {
    return access_token;
  }

  if (!refresh_token) return null;

  try {
    const body = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID!,
      client_secret: MICROSOFT_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token,
      scope: SCOPES,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[OneDrive] Token refresh failed:', err);
      return null;
    }

    const data = await res.json();
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);

    await pool.query(
      `UPDATE onedrive_connections 
       SET access_token = $1, refresh_token = COALESCE($2, refresh_token), token_expires_at = $3, updated_at = NOW() 
       WHERE user_id = $4`,
      [data.access_token, data.refresh_token || null, newExpiresAt, userId]
    );

    return data.access_token;
  } catch (err: any) {
    console.error('[OneDrive] Token refresh error:', err.message);
    return null;
  }
}

async function graphRequest(accessToken: string, endpoint: string): Promise<any> {
  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_API}${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error ${res.status}: ${text}`);
  }
  return res.json();
}

router.get('/configured', (_req, res) => {
  res.json({ configured: isConfigured() });
});

router.get('/auth', authenticateToken as any, (req: AuthRequest, res: Response) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: 'OneDrive integration is not configured' });
  }

  const state = crypto.randomBytes(24).toString('hex');
  pendingAuthStates.set(state, {
    userId: req.userId!,
    expires: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: MICROSOFT_REDIRECT_URI!,
    scope: SCOPES,
    state,
    response_mode: 'query',
    prompt: 'consent',
  });

  res.json({ authUrl: `${AUTH_URL}?${params.toString()}` });
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[OneDrive] OAuth error:', error, req.query.error_description);
    return res.redirect('/app?onedrive=error&message=' + encodeURIComponent(String(req.query.error_description || error)));
  }

  if (!code || !state) {
    return res.redirect('/app?onedrive=error&message=Missing+parameters');
  }

  const pending = pendingAuthStates.get(state as string);
  if (!pending || pending.expires < Date.now()) {
    pendingAuthStates.delete(state as string);
    return res.redirect('/app?onedrive=error&message=Session+expired');
  }

  pendingAuthStates.delete(state as string);
  const userId = pending.userId;

  try {
    const body = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID!,
      client_secret: MICROSOFT_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: MICROSOFT_REDIRECT_URI!,
      scope: SCOPES,
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[OneDrive] Token exchange failed:', err);
      return res.redirect('/app?onedrive=error&message=Token+exchange+failed');
    }

    const tokenData = await tokenRes.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    let accountEmail = '';
    let accountName = '';
    try {
      const profile = await graphRequest(tokenData.access_token, '/me');
      accountEmail = profile.mail || profile.userPrincipalName || '';
      accountName = profile.displayName || '';
    } catch (e: any) {
      console.warn('[OneDrive] Could not fetch profile:', e.message);
    }

    await pool.query(
      `INSERT INTO onedrive_connections (user_id, access_token, refresh_token, token_expires_at, account_email, account_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         account_email = EXCLUDED.account_email,
         account_name = EXCLUDED.account_name,
         updated_at = NOW()`,
      [userId, tokenData.access_token, tokenData.refresh_token || null, expiresAt, accountEmail, accountName]
    );

    console.log(`[OneDrive] Connected for user ${userId} (${accountEmail})`);
    return res.redirect('/app?onedrive=connected');
  } catch (err: any) {
    console.error('[OneDrive] Callback error:', err.message);
    return res.redirect('/app?onedrive=error&message=' + encodeURIComponent(err.message));
  }
});

router.get('/status', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT account_email, account_name, connected_at FROM onedrive_connections WHERE user_id = $1',
      [req.userId]
    );

    if (rows.length === 0) {
      return res.json({ connected: false, configured: isConfigured() });
    }

    return res.json({
      connected: true,
      configured: isConfigured(),
      accountEmail: rows[0].account_email,
      accountName: rows[0].account_name,
      connectedAt: rows[0].connected_at,
    });
  } catch (err: any) {
    console.error('[OneDrive] Status error:', err.message);
    return res.json({ connected: false, configured: isConfigured() });
  }
});

router.delete('/disconnect', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM onedrive_connections WHERE user_id = $1', [req.userId]);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[OneDrive] Disconnect error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

router.get('/browse', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await refreshAccessToken(req.userId!);
    if (!accessToken) {
      return res.status(401).json({ error: 'OneDrive not connected or token expired. Please reconnect.' });
    }

    const folderId = req.query.folderId as string | undefined;
    const endpoint = folderId
      ? `/me/drive/items/${folderId}/children?$top=200&$orderby=name`
      : '/me/drive/root/children?$top=200&$orderby=name';

    const data = await graphRequest(accessToken, endpoint);

    let breadcrumb: Array<{ id: string; name: string }> = [];
    if (folderId) {
      try {
        const item = await graphRequest(accessToken, `/me/drive/items/${folderId}`);
        const crumbs: Array<{ id: string; name: string }> = [];
        if (item.parentReference?.path) {
          const pathParts = item.parentReference.path.replace('/drive/root:', '').split('/').filter(Boolean);
          let currentPath = '';
          for (const part of pathParts) {
            currentPath += '/' + part;
            crumbs.push({ id: '', name: decodeURIComponent(part) });
          }
        }
        crumbs.push({ id: folderId, name: item.name });
        breadcrumb = crumbs;
      } catch (e) {
        breadcrumb = [{ id: folderId, name: 'Current Folder' }];
      }
    }

    const items = (data.value || []).map((item: any) => {
      const isFolder = !!item.folder;
      const isMedia = !isFolder && MEDIA_EXTENSIONS.test(item.name);
      return {
        id: item.id,
        name: item.name,
        isFolder,
        isMedia,
        size: item.size || 0,
        lastModified: item.lastModifiedDateTime,
        mimeType: item.file?.mimeType || null,
        childCount: item.folder?.childCount || 0,
      };
    });

    const folders = items.filter((i: any) => i.isFolder);
    const mediaFiles = items.filter((i: any) => i.isMedia);

    return res.json({ folders, mediaFiles, breadcrumb });
  } catch (err: any) {
    console.error('[OneDrive] Browse error:', err.message);
    return res.status(500).json({ error: 'Failed to browse OneDrive: ' + err.message });
  }
});

router.post('/transcribe', authenticateToken as any, async (req: AuthRequest, res: Response) => {
  try {
    const { fileId, fileName, folderId, expectedSpeakers, recordingType, practiceArea } = req.body;

    if (!fileId || !fileName) {
      return res.status(400).json({ error: 'fileId and fileName are required' });
    }

    const accessToken = await refreshAccessToken(req.userId!);
    if (!accessToken) {
      return res.status(401).json({ error: 'OneDrive not connected or token expired' });
    }

    const ext = path.extname(fileName).toLowerCase() || '.bin';
    const contentType = getContentTypeFromExt(ext);
    const s3Key = `uploads/${req.userId}/${crypto.randomUUID()}${ext}`;

    const transcriptId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO transcripts (id, user_id, filename, file_url, type, status, expected_speakers, recording_type, practice_area, folder_id, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, 'onedrive', NOW(), NOW())`,
      [
        transcriptId,
        req.userId,
        fileName,
        `s3://${s3Key}`,
        ext.replace('.', '') || 'unknown',
        expectedSpeakers || null,
        recordingType || null,
        practiceArea || null,
        folderId || null,
      ]
    );

    res.json({
      id: transcriptId,
      filename: fileName,
      status: 'pending',
      message: 'Downloading from OneDrive and starting transcription...',
    });

    (async () => {
      const tempDir = path.join(tmpdir(), `onedrive_${crypto.randomUUID()}`);
      try {
        await mkdir(tempDir, { recursive: true });
        const tempPath = path.join(tempDir, `file${ext}`);

        console.log(`[OneDrive] Downloading file: ${fileName} (${fileId})`);
        const downloadUrl = `${GRAPH_API}/me/drive/items/${fileId}/content`;
        const downloadRes = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          redirect: 'follow',
        });

        if (!downloadRes.ok) {
          throw new Error(`Download failed: ${downloadRes.status} ${downloadRes.statusText}`);
        }

        const nodeStream = Readable.fromWeb(downloadRes.body as any);
        const fileWriteStream = createWriteStream(tempPath);
        await pipeline(nodeStream, fileWriteStream);
        const { stat } = await import('fs/promises');
        const fileStats = await stat(tempPath);
        console.log(`[OneDrive] Downloaded ${(fileStats.size / 1024 / 1024).toFixed(1)} MB → ${tempPath}`);

        console.log(`[OneDrive] Uploading to S3: ${s3Key}`);
        await uploadFileToS3(tempPath, s3Key, contentType);
        console.log(`[OneDrive] S3 upload complete`);

        await pool.query(
          `UPDATE transcripts SET status = 'processing', updated_at = NOW() WHERE id = $1`,
          [transcriptId]
        );

        await processTranscription(transcriptId);
      } catch (err: any) {
        console.error(`[OneDrive] Pipeline error for ${transcriptId}:`, err.message);
        await pool.query(
          `UPDATE transcripts SET status = 'error', updated_at = NOW() WHERE id = $1`,
          [transcriptId]
        );
      } finally {
        try { await rm(tempDir, { recursive: true, force: true }); } catch {}
      }
    })();
  } catch (err: any) {
    console.error('[OneDrive] Transcribe error:', err.message);
    return res.status(500).json({ error: 'Failed to start transcription: ' + err.message });
  }
});

function getContentTypeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.webm': 'audio/webm',
    '.wma': 'audio/x-ms-wma',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.3gp': 'video/3gpp',
    '.m4v': 'video/mp4',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg',
  };
  return map[ext] || 'application/octet-stream';
}

export default router;
