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
    clearToken();
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
    changePassword: (currentPassword: string, newPassword: string) =>
      request('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
  },
  transcripts: {
    list: () => request('/transcripts'),
    upload: async (file: File, description?: string, folderId?: string, onProgress?: (percent: number) => void, expectedSpeakers?: number | null, recordingType?: string, practiceArea?: string) => {
      const presignedRes = await request('/transcripts/presigned-upload', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSize: file.size,
          description,
          folderId,
        }),
      });

      if (!presignedRes.presignedUrl) {
        throw new Error(presignedRes.error || 'Failed to get upload URL');
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignedRes.presignedUrl);
        xhr.setRequestHeader('Content-Type', presignedRes.contentType || file.type || 'application/octet-stream');

        if (onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(Math.min(percent, 95));
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload to storage failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Failed to upload file to storage. Please try again.'));
        };

        xhr.send(file);
      });

      if (onProgress) onProgress(98);

      const confirmRes = await request('/transcripts/confirm-upload', {
        method: 'POST',
        body: JSON.stringify({
          uploadToken: presignedRes.uploadToken,
          description,
          folderId,
          expectedSpeakers: expectedSpeakers || null,
          recordingType: recordingType || null,
          practiceArea: practiceArea || null,
        }),
      });

      if (onProgress) onProgress(100);
      return confirmRes;
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
    summarize: async (id: string, agentType: string, subType?: string) => {
      const token = getToken();
      const res = await fetch(`${API_BASE}/transcripts/${id}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ agentType, subType }),
      });
      if (res.status === 401 || res.status === 403) {
        clearToken();
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
