import pool from './db.js';

export type Permission = 'none' | 'view' | 'edit';

export interface AccessResult {
  permission: Permission;
  isOwner: boolean;
  ownerUserId?: string;
  ownerName?: string;
  sharedVia?: 'direct' | 'folder';
}

function higherPermission(a: Permission, b: Permission): Permission {
  if (a === 'edit' || b === 'edit') return 'edit';
  if (a === 'view' || b === 'view') return 'view';
  return 'none';
}

export async function checkAccess(
  userId: string,
  resourceType: 'transcript' | 'folder',
  resourceId: string
): Promise<AccessResult> {
  if (resourceType === 'folder') {
    const folderResult = await pool.query(
      'SELECT id, user_id FROM folders WHERE id = $1',
      [resourceId]
    );
    if (folderResult.rows.length === 0) {
      return { permission: 'none', isOwner: false };
    }
    const folder = folderResult.rows[0];
    if (folder.user_id === userId) {
      return { permission: 'edit', isOwner: true, ownerUserId: folder.user_id };
    }

    const shareResult = await pool.query(
      `SELECT s.permission, u.full_name as owner_name
       FROM shares s
       JOIN users u ON u.id = s.owner_user_id
       WHERE s.resource_type = 'folder'
         AND s.resource_id = $1
         AND s.shared_with_id = $2
         AND s.revoked_at IS NULL`,
      [resourceId, userId]
    );

    if (shareResult.rows.length === 0) {
      return { permission: 'none', isOwner: false, ownerUserId: folder.user_id };
    }

    let perm: Permission = 'none';
    for (const row of shareResult.rows) {
      perm = higherPermission(perm, row.permission as Permission);
    }

    return {
      permission: perm,
      isOwner: false,
      ownerUserId: folder.user_id,
      ownerName: shareResult.rows[0].owner_name,
      sharedVia: 'direct',
    };
  }

  const transcriptResult = await pool.query(
    'SELECT id, user_id, folder_id FROM transcripts WHERE id = $1',
    [resourceId]
  );
  if (transcriptResult.rows.length === 0) {
    return { permission: 'none', isOwner: false };
  }

  const transcript = transcriptResult.rows[0];
  if (transcript.user_id === userId) {
    return { permission: 'edit', isOwner: true, ownerUserId: transcript.user_id };
  }

  const directShareResult = await pool.query(
    `SELECT s.permission, u.full_name as owner_name
     FROM shares s
     JOIN users u ON u.id = s.owner_user_id
     WHERE s.resource_type = 'transcript'
       AND s.resource_id = $1
       AND s.shared_with_id = $2
       AND s.revoked_at IS NULL`,
    [resourceId, userId]
  );

  let directPerm: Permission = 'none';
  let ownerName: string | undefined;
  let sharedVia: 'direct' | 'folder' | undefined;

  for (const row of directShareResult.rows) {
    directPerm = higherPermission(directPerm, row.permission as Permission);
    ownerName = row.owner_name;
    sharedVia = 'direct';
  }

  let folderPerm: Permission = 'none';
  if (transcript.folder_id) {
    const folderShareResult = await pool.query(
      `SELECT s.permission, u.full_name as owner_name
       FROM shares s
       JOIN users u ON u.id = s.owner_user_id
       WHERE s.resource_type = 'folder'
         AND s.resource_id = $1
         AND s.shared_with_id = $2
         AND s.revoked_at IS NULL`,
      [transcript.folder_id, userId]
    );

    for (const row of folderShareResult.rows) {
      folderPerm = higherPermission(folderPerm, row.permission as Permission);
      if (!ownerName) {
        ownerName = row.owner_name;
        sharedVia = 'folder';
      }
    }
  }

  const finalPerm = higherPermission(directPerm, folderPerm);

  if (finalPerm === 'none') {
    return { permission: 'none', isOwner: false, ownerUserId: transcript.user_id };
  }

  if (!sharedVia) {
    sharedVia = directPerm !== 'none' ? 'direct' : 'folder';
  }

  return {
    permission: finalPerm,
    isOwner: false,
    ownerUserId: transcript.user_id,
    ownerName,
    sharedVia,
  };
}

export async function checkTranscriptAccessByFileUrl(
  userId: string,
  fileUrl: string
): Promise<AccessResult> {
  const result = await pool.query(
    'SELECT id, user_id FROM transcripts WHERE file_url = $1 LIMIT 1',
    [fileUrl]
  );
  if (result.rows.length === 0) {
    return { permission: 'none', isOwner: false };
  }
  return checkAccess(userId, 'transcript', result.rows[0].id);
}
