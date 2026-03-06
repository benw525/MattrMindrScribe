const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string) {
  localStorage.setItem('auth_token', token);
}

export function clearToken() {
  localStorage.removeItem('auth_token');
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
    window.location.href = '/login';
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
    upload: (file: File, description?: string, folderId?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (description) formData.append('description', description);
      if (folderId) formData.append('folderId', folderId);
      return request('/transcripts/upload', { method: 'POST', body: formData });
    },
    update: (id: string, updates: Record<string, any>) =>
      request(`/transcripts/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (ids: string[]) =>
      request('/transcripts', { method: 'DELETE', body: JSON.stringify({ ids }) }),
    createVersion: (id: string, changeDescription: string) =>
      request(`/transcripts/${id}/versions`, { method: 'POST', body: JSON.stringify({ changeDescription }) }),
    getVersions: (id: string) => request(`/transcripts/${id}/versions`),
  },
  folders: {
    list: () => request('/folders'),
    create: (name: string, caseNumber?: string, parentId?: string | null) =>
      request('/folders', { method: 'POST', body: JSON.stringify({ name, caseNumber, parentId }) }),
    update: (id: string, updates: Record<string, any>) =>
      request(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string) => request(`/folders/${id}`, { method: 'DELETE' }),
    moveTranscripts: (transcriptIds: string[], folderId: string | null) =>
      request('/folders/move-transcripts', { method: 'POST', body: JSON.stringify({ transcriptIds, folderId }) }),
  },
  stripe: {
    getProducts: () => request('/stripe/products'),
    createCheckoutSession: (priceId: string) =>
      request('/stripe/create-checkout-session', { method: 'POST', body: JSON.stringify({ priceId }) }),
    getSubscription: () => request('/stripe/subscription'),
    createPortalSession: () =>
      request('/stripe/customer-portal', { method: 'POST' }),
  },
};
