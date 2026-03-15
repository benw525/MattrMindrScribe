const API_BASE = '/api';

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function isAuthenticated(): boolean {
  return document.cookie.includes('csrf_token=');
}

export function clearAuthState() {
  window.dispatchEvent(new CustomEvent('auth_token_cleared'));
}

async function request(endpoint: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const csrfToken = getCsrfToken();
  if (csrfToken && options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = csrfToken;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (networkErr) {
    throw new Error('Unable to connect to the server. Please try again in a moment.');
  }

  if (res.status === 401) {
    clearAuthState();
    throw new Error('Authentication required');
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

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (email: string, password: string, fullName: string) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, fullName }) }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  },
  transcripts: {
    list: () => request('/transcripts'),
    upload: async (file: File, description?: string, folderId?: string, onProgress?: (percent: number) => void, expectedSpeakers?: number | null, recordingType?: string, practiceArea?: string) => {
      const contentType = file.type || 'application/octet-stream';

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
      const completedParts: Array<{ PartNumber: number; ETag: string }> = [];
      const partBytesLoaded: Record<number, number> = {};
      const CONCURRENT_UPLOADS = 5;
      const MAX_RETRIES = 3;

      const reportProgress = () => {
        if (!onProgress) return;
        const totalLoaded = Object.values(partBytesLoaded).reduce((sum, b) => sum + b, 0);
        const percent = Math.round((totalLoaded / file.size) * 95);
        onProgress(Math.min(percent, 95));
      };

      const uploadPart = async (partNumber: number, presignedUrl: string): Promise<{ PartNumber: number; ETag: string }> => {
        const start = (partNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        partBytesLoaded[partNumber] = 0;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            const etag = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('PUT', presignedUrl);
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
            if (attempt === MAX_RETRIES - 1) throw err;
            partBytesLoaded[partNumber] = 0;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));

            const refreshRes = await request('/transcripts/multipart/presign-part', {
              method: 'POST',
              body: JSON.stringify({ uploadToken, partNumber }),
            });
            presignedUrl = refreshRes.url;
          }
        }
        throw new Error('Unreachable');
      };

      try {
        for (let batchStart = 1; batchStart <= totalParts; batchStart += CONCURRENT_UPLOADS) {
          const batchEnd = Math.min(batchStart + CONCURRENT_UPLOADS - 1, totalParts);
          const partNumbers = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

          const batchRes = await request('/transcripts/multipart/presign-batch', {
            method: 'POST',
            body: JSON.stringify({ uploadToken, partNumbers }),
          });

          const batchPromises = batchRes.urls.map((u: { partNumber: number; url: string }) =>
            uploadPart(u.partNumber, u.url)
          );

          const batchResults = await Promise.all(batchPromises);
          completedParts.push(...batchResults);
        }

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
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      const res = await fetch(`${API_BASE}/transcripts/${id}/summarize`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ agentType, subType, ...(customDescription ? { customDescription } : {}) }),
      });
      if (res.status === 401) {
        clearAuthState();
        throw new Error('Authentication required');
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
