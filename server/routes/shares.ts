import { Router, Response } from 'express';
import pool from '../db.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { checkAccess } from '../checkAccess.js';

const router = Router();

router.use(authenticateToken);

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { email, resourceType, resourceId, permission } = req.body;

    if (!email || !resourceType || !resourceId || !permission) {
      return res.status(400).json({ error: 'email, resourceType, resourceId, and permission are required' });
    }

    if (!['transcript', 'folder'].includes(resourceType)) {
      return res.status(400).json({ error: 'resourceType must be "transcript" or "folder"' });
    }

    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be "view" or "edit"' });
    }

    let ownerCheck: any;
    if (resourceType === 'transcript') {
      ownerCheck = await pool.query(
        'SELECT id, user_id FROM transcripts WHERE id = $1 AND user_id = $2',
        [resourceId, req.userId]
      );
    } else {
      ownerCheck = await pool.query(
        'SELECT id, user_id FROM folders WHERE id = $1 AND user_id = $2',
        [resourceId, req.userId]
      );
    }

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found or you are not the owner' });
    }

    const targetUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    console.log(`[Share] Share attempt: ${email} -> ${resourceType}/${resourceId} by user ${req.userId}`);

    if (targetUser.rows.length === 0) {
      return res.json({
        message: "If this user has a Scribe account, they'll receive access.",
        shared: false,
      });
    }

    const targetUserId = targetUser.rows[0].id;

    if (targetUserId === req.userId) {
      return res.status(400).json({ error: 'You cannot share with yourself' });
    }

    const existingShare = await pool.query(
      `SELECT id, permission, revoked_at FROM shares
       WHERE resource_type = $1 AND resource_id = $2 AND shared_with_id = $3 AND owner_user_id = $4
       ORDER BY created_at DESC LIMIT 1`,
      [resourceType, resourceId, targetUserId, req.userId]
    );

    if (existingShare.rows.length > 0) {
      const existing = existingShare.rows[0];
      if (existing.revoked_at === null) {
        if (existing.permission === permission) {
          return res.json({
            message: "If this user has a Scribe account, they'll receive access.",
            shared: true,
          });
        }
        await pool.query(
          'UPDATE shares SET permission = $1 WHERE id = $2',
          [permission, existing.id]
        );
        return res.json({
          message: "If this user has a Scribe account, they'll receive access.",
          shared: true,
        });
      }
    }

    await pool.query(
      `INSERT INTO shares (resource_type, resource_id, owner_user_id, shared_with_id, permission)
       VALUES ($1, $2, $3, $4, $5)`,
      [resourceType, resourceId, req.userId, targetUserId, permission]
    );

    res.json({
      message: "If this user has a Scribe account, they'll receive access.",
      shared: true,
    });
  } catch (err) {
    console.error('Create share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/resource/:resourceType/:resourceId', async (req: AuthRequest, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;

    if (!['transcript', 'folder'].includes(resourceType)) {
      return res.status(400).json({ error: 'Invalid resource type' });
    }

    let ownerCheck: any;
    if (resourceType === 'transcript') {
      ownerCheck = await pool.query(
        'SELECT id FROM transcripts WHERE id = $1 AND user_id = $2',
        [resourceId, req.userId]
      );
    } else {
      ownerCheck = await pool.query(
        'SELECT id FROM folders WHERE id = $1 AND user_id = $2',
        [resourceId, req.userId]
      );
    }

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.permission, s.created_at as "createdAt",
              u.email, u.full_name as "fullName"
       FROM shares s
       JOIN users u ON u.id = s.shared_with_id
       WHERE s.resource_type = $1 AND s.resource_id = $2 AND s.owner_user_id = $3
         AND s.revoked_at IS NULL
       ORDER BY s.created_at DESC`,
      [resourceType, resourceId, req.userId]
    );

    res.json(rows);
  } catch (err) {
    console.error('List shares error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:shareId', async (req: AuthRequest, res: Response) => {
  try {
    const { shareId } = req.params;
    const { permission } = req.body;

    if (!permission || !['view', 'edit'].includes(permission)) {
      return res.status(400).json({ error: 'permission must be "view" or "edit"' });
    }

    const { rows } = await pool.query(
      `UPDATE shares SET permission = $1
       WHERE id = $2 AND owner_user_id = $3 AND revoked_at IS NULL
       RETURNING id, permission`,
      [permission, shareId, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Update share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:shareId', async (req: AuthRequest, res: Response) => {
  try {
    const { shareId } = req.params;

    const { rows } = await pool.query(
      `UPDATE shares SET revoked_at = NOW(), revoked_by = $1
       WHERE id = $2 AND owner_user_id = $3 AND revoked_at IS NULL
       RETURNING id`,
      [req.userId, shareId, req.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Revoke share error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/shared-with-me', async (req: AuthRequest, res: Response) => {
  try {
    const transcriptShares = await pool.query(
      `SELECT s.id as share_id, s.permission, s.created_at as shared_at,
              t.id, t.filename, t.description, t.status, t.type, t.duration,
              t.file_size, t.file_url, t.folder_id, t.recording_type, t.practice_area,
              t.created_at, t.updated_at,
              u.full_name as owner_name, u.email as owner_email, u.id as owner_id
       FROM shares s
       JOIN transcripts t ON t.id = s.resource_id
       JOIN users u ON u.id = s.owner_user_id
       WHERE s.shared_with_id = $1
         AND s.resource_type = 'transcript'
         AND s.revoked_at IS NULL
       ORDER BY s.created_at DESC`,
      [req.userId]
    );

    const folderShares = await pool.query(
      `SELECT s.id as share_id, s.permission, s.created_at as shared_at,
              f.id, f.name, f.case_number, f.parent_id,
              u.full_name as owner_name, u.email as owner_email, u.id as owner_id
       FROM shares s
       JOIN folders f ON f.id = s.resource_id
       JOIN users u ON u.id = s.owner_user_id
       WHERE s.shared_with_id = $1
         AND s.resource_type = 'folder'
         AND s.revoked_at IS NULL
       ORDER BY s.created_at DESC`,
      [req.userId]
    );

    const sharedTranscripts = transcriptShares.rows.map(row => ({
      shareId: row.share_id,
      permission: row.permission,
      sharedAt: row.shared_at,
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      ownerId: row.owner_id,
      resourceType: 'transcript' as const,
      transcript: {
        id: row.id,
        filename: row.filename,
        description: row.description,
        status: row.status,
        type: row.type,
        duration: row.duration,
        fileSize: row.file_size,
        fileUrl: row.file_url,
        folderId: row.folder_id,
        recordingType: row.recording_type,
        practiceArea: row.practice_area,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    }));

    const sharedFolders = folderShares.rows.map(row => ({
      shareId: row.share_id,
      permission: row.permission,
      sharedAt: row.shared_at,
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      ownerId: row.owner_id,
      resourceType: 'folder' as const,
      folder: {
        id: row.id,
        name: row.name,
        caseNumber: row.case_number,
        parentId: row.parent_id,
      },
    }));

    res.json({ transcripts: sharedTranscripts, folders: sharedFolders });
  } catch (err) {
    console.error('Get shared with me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/folder/:folderId/transcripts', async (req: AuthRequest, res: Response) => {
  try {
    const { folderId } = req.params;

    const access = await checkAccess(req.userId!, 'folder', folderId);
    if (access.permission === 'none') {
      return res.status(404).json({ error: 'Folder not found or access denied' });
    }

    const { rows } = await pool.query(
      `SELECT t.id, t.filename, t.description, t.status, t.type, t.duration,
              t.file_size, t.file_url, t.folder_id, t.recording_type, t.practice_area,
              t.created_at, t.updated_at
       FROM transcripts t
       WHERE t.folder_id = $1
       ORDER BY t.created_at DESC`,
      [folderId]
    );

    const transcripts = rows.map(row => ({
      id: row.id,
      filename: row.filename,
      description: row.description,
      status: row.status,
      type: row.type,
      duration: row.duration,
      fileSize: row.file_size,
      fileUrl: row.file_url,
      folderId: row.folder_id,
      recordingType: row.recording_type,
      practiceArea: row.practice_area,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json(transcripts);
  } catch (err) {
    console.error('Get shared folder transcripts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/move-check', async (req: AuthRequest, res: Response) => {
  try {
    const { transcriptIds, fromFolderId, toFolderId } = req.query;

    if (!transcriptIds) {
      return res.status(400).json({ error: 'transcriptIds required' });
    }

    const ids = (transcriptIds as string).split(',');

    const ownershipCheck = await pool.query(
      `SELECT id FROM transcripts WHERE id = ANY($1::uuid[]) AND user_id = $2`,
      [ids, req.userId]
    );
    if (ownershipCheck.rows.length !== ids.length) {
      return res.status(403).json({ error: 'You can only check transcripts you own' });
    }

    if (fromFolderId) {
      const folderOwnership = await pool.query(
        'SELECT id FROM folders WHERE id = $1 AND user_id = $2',
        [fromFolderId, req.userId]
      );
      if (folderOwnership.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const affectedUsers: { name: string; losesAccess: boolean }[] = [];

    if (fromFolderId) {
      const folderShares = await pool.query(
        `SELECT u.email, u.full_name as "fullName"
         FROM shares s
         JOIN users u ON u.id = s.shared_with_id
         WHERE s.resource_type = 'folder' AND s.resource_id = $1 AND s.revoked_at IS NULL`,
        [fromFolderId]
      );

      for (const user of folderShares.rows) {
        const sharedUserId = await pool.query(
          'SELECT id FROM users WHERE email = $1', [user.email]
        );
        if (sharedUserId.rows.length === 0) continue;
        const uid = sharedUserId.rows[0].id;

        const hasDirectShare = await pool.query(
          `SELECT id FROM shares
           WHERE resource_type = 'transcript'
             AND resource_id = ANY($1::uuid[])
             AND shared_with_id = $2
             AND revoked_at IS NULL`,
          [ids, uid]
        );

        let willHaveAccessInTarget = false;
        if (toFolderId) {
          const targetFolderShare = await pool.query(
            `SELECT id FROM shares
             WHERE resource_type = 'folder'
               AND resource_id = $1
               AND shared_with_id = $2
               AND revoked_at IS NULL`,
            [toFolderId, uid]
          );
          willHaveAccessInTarget = targetFolderShare.rows.length > 0;
        }

        if (hasDirectShare.rows.length === 0 && !willHaveAccessInTarget) {
          affectedUsers.push({ name: user.fullName, losesAccess: true });
        }
      }
    }

    res.json({ affectedUsers });
  } catch (err) {
    console.error('Move check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
