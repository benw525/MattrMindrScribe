import { Router, Response } from 'express';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { mattrmindrConnectSchema, mattrmindrSendConfirmSchema, mattrmindrSendTranscriptSchema } from '../validation/schemas.js';

const router = Router();

router.use(authenticateToken);

function validateBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

router.post('/connect', validate(mattrmindrConnectSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { baseUrl, email, password } = req.body;

    const cleanUrl = validateBaseUrl(baseUrl);
    if (!cleanUrl) {
      return res.status(400).json({ error: 'Please provide a valid public URL (https preferred)' });
    }

    let authResponse: globalThis.Response;
    try {
      authResponse = await fetch(`${cleanUrl}/api/external/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err: any) {
      return res.status(502).json({ error: 'Could not connect to MattrMindr server. Please check the URL.' });
    }

    if (!authResponse.ok) {
      const errorData = await authResponse.json().catch(() => ({}));
      return res.status(401).json({ error: (errorData as any).error || 'Invalid MattrMindr credentials' });
    }

    const authData = await authResponse.json() as { token: string; user: { id: string; email: string; fullName: string } };

    if (!authData.token) {
      return res.status(502).json({ error: 'MattrMindr returned an invalid response' });
    }

    const existing = await pool.query(
      'SELECT id FROM mattrmindr_connections WHERE user_id = $1',
      [req.userId]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE mattrmindr_connections SET base_url = $1, email = $2, auth_token = $3, updated_at = NOW() WHERE user_id = $4`,
        [cleanUrl, email, authData.token, req.userId]
      );
    } else {
      await pool.query(
        `INSERT INTO mattrmindr_connections (user_id, base_url, email, auth_token) VALUES ($1, $2, $3, $4)`,
        [req.userId, cleanUrl, email, authData.token]
      );
    }

    res.json({
      connected: true,
      baseUrl: cleanUrl,
      email,
      userName: authData.user?.fullName || email,
    });
  } catch (err: any) {
    console.error('MattrMindr connect error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT base_url, email, connected_at FROM mattrmindr_connections WHERE user_id = $1',
      [req.userId]
    );

    if (rows.length === 0) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      baseUrl: rows[0].base_url,
      email: rows[0].email,
      connectedAt: rows[0].connected_at,
    });
  } catch (err: any) {
    console.error('MattrMindr status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/disconnect', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM mattrmindr_connections WHERE user_id = $1', [req.userId]);
    res.json({ connected: false });
  } catch (err: any) {
    console.error('MattrMindr disconnect error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getConnection(userId: string) {
  const { rows } = await pool.query(
    'SELECT base_url, auth_token FROM mattrmindr_connections WHERE user_id = $1',
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
}

router.get('/cases', async (req: AuthRequest, res: Response) => {
  try {
    const conn = await getConnection(req.userId!);
    if (!conn) {
      return res.status(400).json({ error: 'Not connected to MattrMindr' });
    }

    const q = (req.query.q as string) || '';
    const url = `${conn.base_url}/api/external/cases?q=${encodeURIComponent(q)}`;

    let mmResponse: globalThis.Response;
    try {
      mmResponse = await fetch(url, {
        headers: { 'Authorization': `Bearer ${conn.auth_token}` },
      });
    } catch (err: any) {
      return res.status(502).json({ error: 'Could not reach MattrMindr server' });
    }

    if (mmResponse.status === 401) {
      return res.status(401).json({ error: 'MattrMindr session expired. Please reconnect in Settings.' });
    }

    if (!mmResponse.ok) {
      return res.status(502).json({ error: 'MattrMindr returned an error' });
    }

    const data = await mmResponse.json();
    res.json(data);
  } catch (err: any) {
    console.error('MattrMindr cases error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/send/:folderId', async (req: AuthRequest, res: Response) => {
  try {
    const conn = await getConnection(req.userId!);
    if (!conn) {
      return res.status(400).json({ error: 'Not connected to MattrMindr' });
    }

    const { folderId } = req.params;

    const folderResult = await pool.query(
      'SELECT mattrmindr_case_id, mattrmindr_case_name, name FROM folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [folderId, req.userId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const folder = folderResult.rows[0];
    if (!folder.mattrmindr_case_id) {
      return res.status(400).json({ error: 'This folder is not linked to a MattrMindr case' });
    }

    const caseId = folder.mattrmindr_case_id;

    const transcriptsResult = await pool.query(
      `SELECT t.id, t.filename, t.description, t.type, t.duration, t.pipeline_log,
        COALESCE(json_agg(
          json_build_object('startTime', s.start_time, 'endTime', s.end_time, 'speaker', s.speaker, 'text', s.text)
          ORDER BY s.segment_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') as segments
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.folder_id = $1 AND t.user_id = $2 AND t.status = 'completed' AND t.deleted_at IS NULL
      GROUP BY t.id
      ORDER BY t.created_at ASC`,
      [folderId, req.userId]
    );

    if (transcriptsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No completed transcripts in this folder' });
    }

    const conflicts: { transcriptId: string; filename: string; existingFileId: string }[] = [];
    const ready: { transcriptId: string; filename: string }[] = [];

    for (const t of transcriptsResult.rows) {
      try {
        const checkUrl = `${conn.base_url}/api/external/cases/${caseId}/files?filename=${encodeURIComponent(t.filename)}`;
        const checkRes = await fetch(checkUrl, {
          headers: { 'Authorization': `Bearer ${conn.auth_token}` },
        });

        if (checkRes.ok) {
          const checkData = await checkRes.json() as { exists: boolean; fileId?: string };
          if (checkData.exists && checkData.fileId) {
            conflicts.push({ transcriptId: t.id, filename: t.filename, existingFileId: checkData.fileId });
          } else {
            ready.push({ transcriptId: t.id, filename: t.filename });
          }
        } else {
          ready.push({ transcriptId: t.id, filename: t.filename });
        }
      } catch {
        ready.push({ transcriptId: t.id, filename: t.filename });
      }
    }

    if (conflicts.length > 0) {
      return res.json({
        status: 'conflicts',
        conflicts,
        ready,
        totalFiles: transcriptsResult.rows.length,
      });
    }

    const results = await sendFilesToMattrMindr(
      conn,
      caseId,
      transcriptsResult.rows,
      req.userId!,
      {}
    );

    res.json({
      status: 'sent',
      results,
      totalFiles: transcriptsResult.rows.length,
    });
  } catch (err: any) {
    console.error('MattrMindr send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/send/:folderId/confirm', validate(mattrmindrSendConfirmSchema), async (req: AuthRequest, res: Response) => {
  try {
    const conn = await getConnection(req.userId!);
    if (!conn) {
      return res.status(400).json({ error: 'Not connected to MattrMindr' });
    }

    const { folderId } = req.params;
    const { replaceFileIds } = req.body;

    const folderResult = await pool.query(
      'SELECT mattrmindr_case_id FROM folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [folderId, req.userId]
    );

    if (folderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const caseId = folderResult.rows[0].mattrmindr_case_id;
    if (!caseId) {
      return res.status(400).json({ error: 'This folder is not linked to a MattrMindr case' });
    }

    const transcriptsResult = await pool.query(
      `SELECT t.id, t.filename, t.description, t.type, t.duration, t.pipeline_log,
        COALESCE(json_agg(
          json_build_object('startTime', s.start_time, 'endTime', s.end_time, 'speaker', s.speaker, 'text', s.text)
          ORDER BY s.segment_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') as segments
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.folder_id = $1 AND t.user_id = $2 AND t.status = 'completed' AND t.deleted_at IS NULL
      GROUP BY t.id
      ORDER BY t.created_at ASC`,
      [folderId, req.userId]
    );

    const replaceMap: Record<string, string> = {};
    if (replaceFileIds && typeof replaceFileIds === 'object') {
      Object.assign(replaceMap, replaceFileIds);
    }

    const conflictTranscriptIds = new Set(Object.keys(replaceMap));
    const transcriptsToSend: any[] = [];
    for (const t of transcriptsResult.rows) {
      const isConflict = conflictTranscriptIds.has(t.id);
      if (isConflict) {
        transcriptsToSend.push(t);
      } else {
        const checkUrl = `${conn.base_url}/api/external/cases/${caseId}/files?filename=${encodeURIComponent(t.filename)}`;
        try {
          const checkRes = await fetch(checkUrl, {
            headers: { 'Authorization': `Bearer ${conn.auth_token}` },
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json() as { exists: boolean };
            if (!checkData.exists) {
              transcriptsToSend.push(t);
            }
          } else {
            transcriptsToSend.push(t);
          }
        } catch {
          transcriptsToSend.push(t);
        }
      }
    }

    const results = await sendFilesToMattrMindr(
      conn,
      caseId,
      transcriptsToSend,
      req.userId!,
      replaceMap
    );

    res.json({
      status: 'sent',
      results,
      totalFiles: transcriptsResult.rows.length,
    });
  } catch (err: any) {
    console.error('MattrMindr confirm send error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/send-transcript/:transcriptId', validate(mattrmindrSendTranscriptSchema), async (req: AuthRequest, res: Response) => {
  try {
    const conn = await getConnection(req.userId!);
    if (!conn) {
      return res.status(400).json({ error: 'Not connected to MattrMindr' });
    }

    const { transcriptId } = req.params;
    const { caseId, caseName } = req.body;

    const transcriptResult = await pool.query(
      `SELECT t.id, t.filename, t.description, t.type, t.duration, t.pipeline_log, t.folder_id,
        COALESCE(json_agg(
          json_build_object('startTime', s.start_time, 'endTime', s.end_time, 'speaker', s.speaker, 'text', s.text)
          ORDER BY s.segment_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') as segments
      FROM transcripts t
      LEFT JOIN transcript_segments s ON s.transcript_id = t.id
      WHERE t.id = $1 AND t.user_id = $2 AND t.status = 'completed' AND t.deleted_at IS NULL
      GROUP BY t.id`,
      [transcriptId, req.userId]
    );

    if (transcriptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Completed transcript not found' });
    }

    const t = transcriptResult.rows[0];

    let folderLinked = false;
    if (t.folder_id) {
      const folderCheck = await pool.query(
        'SELECT mattrmindr_case_id FROM folders WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
        [t.folder_id, req.userId]
      );
      if (folderCheck.rows.length > 0 && !folderCheck.rows[0].mattrmindr_case_id) {
        await pool.query(
          'UPDATE folders SET mattrmindr_case_id = $1, mattrmindr_case_name = $2 WHERE id = $3 AND user_id = $4',
          [caseId, caseName || 'MattrMindr Case', t.folder_id, req.userId]
        );
        folderLinked = true;
      } else if (folderCheck.rows.length > 0 && folderCheck.rows[0].mattrmindr_case_id === caseId) {
        folderLinked = true;
      }
    }

    if (!folderLinked) {
      const existingFolder = await pool.query(
        'SELECT id FROM folders WHERE mattrmindr_case_id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1',
        [caseId, req.userId]
      );

      let folderId: string;
      if (existingFolder.rows.length > 0) {
        folderId = existingFolder.rows[0].id;
      } else {
        const folderName = caseName || 'MattrMindr Case';
        const newFolder = await pool.query(
          `INSERT INTO folders (name, case_number, user_id, mattrmindr_case_id, mattrmindr_case_name)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [folderName, caseId, req.userId, caseId, folderName]
        );
        folderId = newFolder.rows[0].id;
      }

      await pool.query(
        'UPDATE transcripts SET folder_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
        [folderId, transcriptId, req.userId]
      );
    }

    const results = await sendFilesToMattrMindr(
      conn,
      caseId,
      [t],
      req.userId!,
      {}
    );

    const result = results[0];
    res.json({
      status: result.success ? 'sent' : 'error',
      ...result,
    });
  } catch (err: any) {
    console.error('MattrMindr send-transcript error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function sendFilesToMattrMindr(
  conn: { base_url: string; auth_token: string },
  caseId: string,
  transcripts: any[],
  userId: string,
  replaceMap: Record<string, string>
) {
  const results: { filename: string; success: boolean; replaced: boolean; error?: string }[] = [];

  for (const t of transcripts) {
    try {
      const versionsResult = await pool.query(
        `SELECT segments, change_description, created_at FROM transcript_versions
         WHERE transcript_id = $1 ORDER BY created_at ASC`,
        [t.id]
      );

      const summariesResult = await pool.query(
        `SELECT agent_type, summary, model_used, created_at FROM transcript_summaries
         WHERE transcript_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
        [t.id, userId]
      );

      const payload = {
        filename: t.filename,
        description: t.description || '',
        type: t.type,
        duration: t.duration,
        replaceFileId: replaceMap[t.id] || null,
        transcript: {
          segments: t.segments,
          versions: versionsResult.rows.map((v: any) => ({
            changeDescription: v.change_description,
            createdAt: v.created_at,
            segments: v.segments,
          })),
          summaries: summariesResult.rows.map((s: any) => ({
            agentType: s.agent_type,
            summary: s.summary,
            modelUsed: s.model_used,
            createdAt: s.created_at,
          })),
          pipelineLog: t.pipeline_log,
        },
      };

      const sendUrl = `${conn.base_url}/api/external/cases/${caseId}/files`;
      const sendRes = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${conn.auth_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (sendRes.ok) {
        const sendData = await sendRes.json() as { replaced?: boolean };
        results.push({ filename: t.filename, success: true, replaced: !!sendData.replaced });
      } else {
        const errData = await sendRes.json().catch(() => ({}));
        results.push({ filename: t.filename, success: false, replaced: false, error: (errData as any).error || `HTTP ${sendRes.status}` });
      }
    } catch (err: any) {
      results.push({ filename: t.filename, success: false, replaced: false, error: err.message });
    }
  }

  return results;
}

export default router;
