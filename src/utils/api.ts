const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function clearToken() {
  localStorage.removeItem('auth_token');
  window.dispatchEvent(new CustomEvent('auth_token_cleared'));
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (networkErr) {
    throw new Error('Unable to connect to the server. Please try again in a moment.');
  }

  if (res.status === 401 || res.status === 403) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    const serverMessage = (body?.error || '').toLowerCase();
    const isRealAuthFailure =
      serverMessage.includes('invalid') ||
      serverMessage.includes('expired') ||
      serverMessage.includes('authentication required') ||
      serverMessage.includes('token required') ||
      serverMessage.includes('unauthorized');

    if (isRealAuthFailure) {
      clearToken();
    }
    throw new Error(body?.error || 'Authentication required');
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new Error('The server is temporarily unavailable. Please try again in a moment.');
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('Server returned an unexpected response. Please try again.');
  }

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

let uploadWorker: Worker | null = null;

function getUploadWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!uploadWorker) {
    try {
      uploadWorker = new Worker('/upload-worker.js');
    } catch {
      return null;
    }
  }
  return uploadWorker;
}

async function uploadViaWorker(
  file: File,
  uploadToken: string,
  chunkSize: number,
  totalParts: number,
  partUrls: Record<number, string>,
  contentType: string,
  concurrency: number,
  maxRetries: number,
  onProgress?: (percent: number) => void
): Promise<Array<{ PartNumber: number; ETag: string }>> {
  const worker = getUploadWorker();
  if (!worker) {
    return uploadViaMainThread(file, uploadToken, chunkSize, totalParts, partUrls, contentType, concurrency, maxRetries, onProgress);
  }

  const uploadId = `${uploadToken}-${Date.now()}`;
  const allCompletedParts: Array<{ PartNumber: number; ETag: string }> = [];
  let completedBytes = 0;

  for (let batchStart = 1; batchStart <= totalParts; batchStart += concurrency) {
    const batchEnd = Math.min(batchStart + concurrency - 1, totalParts);
    const batchParts: Array<{ partNumber: number; url: string; blob: Blob; size: number }> = [];

    for (let i = batchStart; i <= batchEnd; i++) {
      const start = (i - 1) * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      batchParts.push({
        partNumber: i,
        url: partUrls[i],
        blob: file.slice(start, end),
        size: end - start,
      });
    }

    const batchResults = await new Promise<Array<{ PartNumber: number; ETag: string }>>((resolve, reject) => {
      const handler = async (e: MessageEvent) => {
        if (e.data.uploadId !== uploadId) return;

        switch (e.data.type) {
          case 'PROGRESS':
            if (onProgress) onProgress(e.data.percent);
            break;
          case 'BATCH_COMPLETE':
            worker.removeEventListener('message', handler);
            resolve(e.data.parts);
            break;
          case 'BATCH_ERROR':
            worker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
            break;
          case 'NEED_URL_REFRESH':
            try {
              const refreshRes = await request('/transcripts/multipart/presign-part', {
                method: 'POST',
                body: JSON.stringify({ uploadToken, partNumber: e.data.partNumber }),
              });
              worker.postMessage({
                type: 'URL_REFRESHED',
                uploadId,
                partNumber: e.data.partNumber,
                url: refreshRes.url,
              });
            } catch {
              worker.postMessage({
                type: 'URL_REFRESHED',
                uploadId,
                partNumber: e.data.partNumber,
                url: partUrls[e.data.partNumber],
              });
            }
            break;
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'UPLOAD_BATCH',
        uploadId,
        data: {
          parts: batchParts,
          contentType,
          totalSize: file.size,
          maxRetries,
          completedBytes,
        },
      });
    });

    allCompletedParts.push(...batchResults);
    for (const p of batchParts) {
      completedBytes += p.size;
    }
  }

  return allCompletedParts;
}

async function uploadViaMainThread(
  file: File,
  uploadToken: string,
  chunkSize: number,
  totalParts: number,
  partUrls: Record<number, string>,
  contentType: string,
  concurrency: number,
  maxRetries: number,
  onProgress?: (percent: number) => void
): Promise<Array<{ PartNumber: number; ETag: string }>> {
  const completedParts: Array<{ PartNumber: number; ETag: string }> = [];
  const partBytesLoaded: Record<number, number> = {};

  const reportProgress = () => {
    if (!onProgress) return;
    const totalLoaded = Object.values(partBytesLoaded).reduce((sum, b) => sum + b, 0);
    const percent = Math.round((totalLoaded / file.size) * 95);
    onProgress(Math.min(percent, 95));
  };

  const uploadPart = async (partNumber: number): Promise<{ PartNumber: number; ETag: string }> => {
    const start = (partNumber - 1) * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    partBytesLoaded[partNumber] = 0;
    let url = partUrls[partNumber];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const etag = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', url);
          xhr.setRequestHeader('Content-Type', contentType);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              partBytesLoaded[partNumber] = e.loaded;
              reportProgress();
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const etag = xhr.getResponseHeader('ETag');
              if (!etag) {
                reject(new Error('Missing ETag in response'));
                return;
              }
              partBytesLoaded[partNumber] = end - start;
              reportProgress();
              resolve(etag);
            } else {
              reject(new Error(`Part upload failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error during part upload'));
          };

          xhr.send(chunk);
        });

        return { PartNumber: partNumber, ETag: etag };
      } catch (err) {
        if (attempt === maxRetries - 1) throw err;
        partBytesLoaded[partNumber] = 0;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));

        const refreshRes = await request('/transcripts/multipart/presign-part', {
          method: 'POST',
          body: JSON.stringify({ uploadToken, partNumber }),
        });
        url = refreshRes.url;
      }
    }
    throw new Error('Unreachable');
  };

  for (let batchStart = 1; batchStart <= totalParts; batchStart += concurrency) {
    const batchEnd = Math.min(batchStart + concurrency - 1, totalParts);
    const batchPromises = [];
    for (let i = batchStart; i <= batchEnd; i++) {
      batchPromises.push(uploadPart(i));
    }
    const batchResults = await Promise.all(batchPromises);
    completedParts.push(...batchResults);
  }

  return completedParts;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, fullName: string) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, fullName }) }),
    me: () => request('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      request('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  },
  transcripts: {
    list: () => request('/transcripts'),
    upload: async (file: File, description?: string, folderId?: string, onProgress?: (percent: number) => void, expectedSpeakers?: number | null, recordingType?: string, practiceArea?: string) => {
      const contentType = file.type || 'application/octet-stream';
      const CONCURRENT_UPLOADS = 5;
      const MAX_RETRIES = 3;

      const initRes = await request('/transcripts/multipart/initiate', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType,
          fileSize: file.size,
        }),
      });

      if (!initRes.uploadToken) {
        throw new Error(initRes.error || 'Failed to initiate upload');
      }

      const { uploadToken, chunkSize, totalParts } = initRes;

      const allPartUrls: Record<number, string> = {};
      for (let batchStart = 1; batchStart <= totalParts; batchStart += CONCURRENT_UPLOADS) {
        const batchEnd = Math.min(batchStart + CONCURRENT_UPLOADS - 1, totalParts);
        const partNumbers = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);
        const batchRes = await request('/transcripts/multipart/presign-batch', {
          method: 'POST',
          body: JSON.stringify({ uploadToken, partNumbers }),
        });
        for (const u of batchRes.urls) {
          allPartUrls[u.partNumber] = u.url;
        }
      }

      let completedParts: Array<{ PartNumber: number; ETag: string }>;

      const useWorker = typeof Worker !== 'undefined';

      if (useWorker) {
        completedParts = await uploadViaWorker(file, uploadToken, chunkSize, totalParts, allPartUrls, contentType, CONCURRENT_UPLOADS, MAX_RETRIES, onProgress);
      } else {
        completedParts = await uploadViaMainThread(file, uploadToken, chunkSize, totalParts, allPartUrls, contentType, CONCURRENT_UPLOADS, MAX_RETRIES, onProgress);
      }

      try {
        await request('/transcripts/multipart/complete', {
          method: 'POST',
          body: JSON.stringify({ uploadToken, parts: completedParts }),
        });

        if (onProgress) onProgress(98);

        const confirmRes = await request('/transcripts/confirm-upload', {
          method: 'POST',
          body: JSON.stringify({
            uploadToken,
            description,
            folderId,
            expectedSpeakers: expectedSpeakers || null,
            recordingType: recordingType || null,
            practiceArea: practiceArea || null,
          }),
        });

        if (onProgress) onProgress(100);
        return confirmRes;
      } catch (err) {
        try {
          await request('/transcripts/multipart/abort', {
            method: 'POST',
            body: JSON.stringify({ uploadToken }),
          });
        } catch (_) {}
        throw err;
      }
    },
    get: (id: string) => request(`/transcripts/${id}/detail`),
    update: (id: string, updates: Record<string, any>) =>
      request(`/transcripts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (ids: string[]) =>
      request('/transcripts', { method: 'DELETE', body: JSON.stringify({ ids }) }),
    createVersion: (id: string, changeDescription: string) =>
      request(`/transcripts/${id}/versions`, { method: 'POST', body: JSON.stringify({ changeDescription }) }),
    getVersions: (id: string) => request(`/transcripts/${id}/versions`),
    getAgents: () => request('/transcripts/agents'),
    summarize: async (id: string, agentType: string, subType?: string, customDescription?: string) => {
      const token = getToken();
      const res = await fetch(`${API_BASE}/transcripts/${id}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ agentType, subType, ...(customDescription ? { customDescription } : {}) }),
      });
      if (res.status === 401 || res.status === 403) {
        let body: any = null;
        try { body = await res.clone().json(); } catch {}
        const serverMessage = (body?.error || '').toLowerCase();
        const isRealAuthFailure =
          serverMessage.includes('invalid') ||
          serverMessage.includes('expired') ||
          serverMessage.includes('authentication required') ||
          serverMessage.includes('token required') ||
          serverMessage.includes('unauthorized');
        if (isRealAuthFailure) {
          clearToken();
        }
        throw new Error(body?.error || 'Authentication required');
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error('The server is temporarily unavailable. Please try again in a moment.');
      }
      return res;
    },
    getSummaries: (id: string) => request(`/transcripts/${id}/summaries`),
    retranscribe: (id: string) => request(`/transcripts/${id}/retranscribe`, { method: 'POST' }),
    mergeSpeaker: (id: string, fromSpeaker: string, toSpeaker: string) =>
      request(`/transcripts/${id}/merge-speaker`, { method: 'POST', body: JSON.stringify({ fromSpeaker, toSpeaker }) }),
    getStatus: (id: string) => request(`/transcripts/${id}/status`),
  },
  folders: {
    list: () => request('/folders'),
    create: (name: string, caseNumber?: string, parentId?: string | null, mattrmindrCaseId?: string | null, mattrmindrCaseName?: string | null) =>
      request('/folders', { method: 'POST', body: JSON.stringify({ name, caseNumber, parentId, mattrmindrCaseId, mattrmindrCaseName }) }),
    update: (id: string, updates: Record<string, any>) =>
      request(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/folders/${id}`, { method: 'DELETE' }),
    moveTranscripts: (transcriptIds: string[], folderId: string | null) =>
      request('/folders/move-transcripts', { method: 'POST', body: JSON.stringify({ transcriptIds, folderId }) }),
  },
  mattrmindr: {
    connect: (baseUrl: string, email: string, password: string) =>
      request('/mattrmindr/connect', { method: 'POST', body: JSON.stringify({ baseUrl, email, password }) }),
    status: () => request('/mattrmindr/status'),
    disconnect: () => request('/mattrmindr/disconnect', { method: 'DELETE' }),
    searchCases: (query: string) => request(`/mattrmindr/cases?q=${encodeURIComponent(query)}`),
    sendToCase: (folderId: string) =>
      request(`/mattrmindr/send/${folderId}`, { method: 'POST' }),
    confirmSend: (folderId: string, replaceFileIds: Record<string, string>) =>
      request(`/mattrmindr/send/${folderId}/confirm`, { method: 'POST', body: JSON.stringify({ replaceFileIds }) }),
    sendTranscript: (transcriptId: string, caseId: string, caseName: string) =>
      request(`/mattrmindr/send-transcript/${transcriptId}`, { method: 'POST', body: JSON.stringify({ caseId, caseName }) }),
  },
};
