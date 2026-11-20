import type {
  LogsResponse,
  NodeItem,
  OverviewData,
  SessionInfo,
  SettingsData,
  TemplateData,
  TemplatePreviewData,
  UserItem,
} from './types';

let onUnauthorized: (() => void) | null = null;

/** 注册全局 401 未登录回调 */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/login') && onUnauthorized) {
      onUnauthorized();
    }
    const msg = typeof data.error === 'string' && data.error ? data.error : `请求失败 (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export const getSession = () => api<SessionInfo>('/api/session');
export const login = (username: string, password: string) =>
  api<{ ok: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
export const logout = () => api<{ ok: boolean }>('/api/logout', { method: 'POST' });
export const changePassword = (current: string, next: string) =>
  api<{ ok: boolean }>('/api/password', { method: 'POST', body: JSON.stringify({ current, next }) });

export const getOverview = () => api<OverviewData>('/api/overview');

export const getNodes = () => api<{ nodes: NodeItem[] }>('/api/nodes');
export const createNode = (payload: Record<string, unknown>) =>
  api<{ id: number; token: string; reality_public_key: string }>('/api/nodes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const updateNode = (id: number, payload: Record<string, unknown>) =>
  api<{ ok: boolean }>(`/api/nodes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
export const deleteNode = (id: number) => api<{ ok: boolean }>(`/api/nodes/${id}`, { method: 'DELETE' });
export const resetNodeToken = (id: number) =>
  api<{ token: string }>(`/api/nodes/${id}/token`, { method: 'POST' });

export const getUsers = () => api<{ users: UserItem[] }>('/api/users');
export const createUser = (payload: Record<string, unknown>) =>
  api<UserItem>('/api/users', { method: 'POST', body: JSON.stringify(payload) });
export const updateUser = (id: number, payload: Record<string, unknown>) =>
  api<UserItem>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteUser = (id: number) => api<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' });
export const resetUserTraffic = (id: number) =>
  api<{ ok: boolean }>(`/api/users/${id}/reset-traffic`, { method: 'POST' });
export const resetUserSub = (id: number) =>
  api<UserItem>(`/api/users/${id}/reset-sub`, { method: 'POST' });
export const resetUserUuid = (id: number) =>
  api<UserItem>(`/api/users/${id}/reset-uuid`, { method: 'POST' });

export const getLogs = (params: { limit?: number; offset?: number; source?: string; level?: string; q?: string }) => {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.source) qs.set('source', params.source);
  if (params.level) qs.set('level', params.level);
  if (params.q) qs.set('q', params.q);
  return api<LogsResponse>(`/api/logs?${qs.toString()}`);
};

export const getSettings = () => api<SettingsData>('/api/settings');
export const saveSettings = (payload: Record<string, unknown>) =>
  api<{ ok: boolean }>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });

export const getTemplate = () => api<TemplateData>('/api/template');
export const saveTemplate = (content: string) =>
  api<{ ok: boolean }>('/api/template', { method: 'PUT', body: JSON.stringify({ content }) });
export const previewTemplate = (content: string, userId?: number) =>
  api<TemplatePreviewData>('/api/template/preview', {
    method: 'POST',
    body: JSON.stringify({ content, user_id: userId }),
  });
