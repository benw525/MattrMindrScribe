import pool from './db.js';

export interface AccessResult {
  allowed: boolean;
  permission: 'owner' | 'edit' | 'view' | null;
}

export async function checkAccess(
  userId: string,
  resourceType: 'transcript' | 'folder',
  resourceId: string
): Promise<AccessResult> {
  if (resourceType === 'transcript') {
    const { rows: ownerRows } = await pool.query(
      'SELECT user_id, folder_id FROM transcripts WHERE id = $1',
      [resourceId]
    );
    if (ownerRows.length === 0) return { allowed: false, permission: null };

    if (ownerRows[0].user_id === userId) {
      return { allowed: true, permission: 'owner' };
    }

    const { rows: shareRows } = await pool.query(
      `SELECT permission FROM shares 
       WHERE shared_with_id = $1 AND resource_type = 'transcript' AND resource_id = $2 AND revoked_at IS NULL
       ORDER BY CASE permission WHEN 'edit' THEN 1 WHEN 'view' THEN 2 END
       LIMIT 1`,
      [userId, resourceId]
    );
    if (shareRows.length > 0) {
      return { allowed: true, permission: shareRows[0].permission };
    }

    const folderId = ownerRows[0].folder_id;
    if (folderId) {
      const { rows: folderShareRows } = await pool.query(
        `SELECT permission FROM shares
         WHERE shared_with_id = $1 AND resource_type = 'folder' AND resource_id = $2 AND revoked_at IS NULL
         ORDER BY CASE permission WHEN 'edit' THEN 1 WHEN 'view' THEN 2 END
         LIMIT 1`,
        [userId, folderId]
      );
      if (folderShareRows.length > 0) {
        return { allowed: true, permission: folderShareRows[0].permission };
      }
    }

    return { allowed: false, permission: null };
  }

  if (resourceType === 'folder') {
    const { rows: ownerRows } = await pool.query(
      'SELECT user_id FROM folders WHERE id = $1',
      [resourceId]
    );
    if (ownerRows.length === 0) return { allowed: false, permission: null };

    if (ownerRows[0].user_id === userId) {
      return { allowed: true, permission: 'owner' };
    }

    const { rows: shareRows } = await pool.query(
      `SELECT permission FROM shares
       WHERE shared_with_id = $1 AND resource_type = 'folder' AND resource_id = $2 AND revoked_at IS NULL
       ORDER BY CASE permission WHEN 'edit' THEN 1 WHEN 'view' THEN 2 END
       LIMIT 1`,
      [userId, resourceId]
    );
    if (shareRows.length > 0) {
      return { allowed: true, permission: shareRows[0].permission };
    }

    return { allowed: false, permission: null };
  }

  return { allowed: false, permission: null };
}
