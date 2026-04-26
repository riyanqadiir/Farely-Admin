import {
  ApiSuccess,
  AdminUserActionResponse,
  AdminUsersResponse,
  AuthPayload,
  ChangePasswordRequest,
  CreateAdminUserRequest,
  HotspotTile,
  HotspotsQuery,
  HotspotsResponse,
  LoginRequest,
  LogoutResponse,
  MeResponse,
  MobileUsersResponse,
  PatchThreadRequest,
  PatchThreadResponse,
  RefreshRequest,
  ReplyRequest,
  ReplyResponse,
  RideLogItem,
  RideLogsQuery,
  RideLogsResponse,
  SupportMessageItem,
  SupportThreadItem,
  SupportThreadsQuery,
  SupportThreadsResponse,
  ThreadMessagesResponse,
  TrafficMetricsQuery,
  TrafficMetricsResponse,
  ActiveUsersResponse,
  ActiveUsersQuery,
  FeedbackListResponse,
  UpdateAdminUserRequest,
  UpdateMeRequest,
} from '../types/dtos';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL || 'http://localhost:4001';

const makeSuccess = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('farely_admin_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const refreshAccessToken = async (): Promise<void> => {
  const refreshToken = localStorage.getItem('farely_admin_refresh_token');
  if (!refreshToken) throw new Error('Session expired. Please sign in again.');
  const res = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  const payload = await res.json();
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error?.message || 'Session refresh failed');
  }
  localStorage.setItem('farely_admin_access_token', payload.data.accessToken);
  localStorage.setItem('farely_admin_refresh_token', payload.data.refreshToken);
  localStorage.setItem('farely_admin_user', JSON.stringify(payload.data.admin));
};

const request = async <T>(path: string, init?: RequestInit, retry = true): Promise<ApiSuccess<T>> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(init?.headers || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const payload = await res.json();
  if (res.status === 401 && retry) {
    await refreshAccessToken();
    return request<T>(path, init, false);
  }
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error?.message || payload?.message || 'Request failed');
  }
  return payload as ApiSuccess<T>;
};

export const api = {
  auth: {
    login: async (payload: LoginRequest) =>
      request<AuthPayload>('/admin/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
    refresh: async (payload: RefreshRequest) =>
      request<AuthPayload>('/admin/auth/refresh', { method: 'POST', body: JSON.stringify(payload) }),
    logout: async (payload: RefreshRequest) =>
      request<LogoutResponse>('/admin/auth/logout', { method: 'POST', body: JSON.stringify(payload) }),
    me: async () => request<MeResponse>('/admin/me'),
    updateMe: async (payload: UpdateMeRequest) =>
      request<MeResponse>('/admin/me', { method: 'PATCH', body: JSON.stringify(payload) }),
    changePassword: async (payload: ChangePasswordRequest) =>
      request<{ changed: boolean }>('/admin/me/change-password', { method: 'POST', body: JSON.stringify(payload) }),
    listAdmins: async () => request<AdminUsersResponse>('/admin/admin-users'),
    createAdmin: async (payload: CreateAdminUserRequest) =>
      request<AdminUserActionResponse>('/admin/admin-users', { method: 'POST', body: JSON.stringify(payload) }),
    updateAdmin: async (id: string, payload: UpdateAdminUserRequest) =>
      request<AdminUserActionResponse>(`/admin/admin-users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    resetAdminPassword: async (id: string, payload?: { password?: string }) =>
      request<AdminUserActionResponse>(`/admin/admin-users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      }),
  },
  metrics: {
    getTraffic: async (query?: TrafficMetricsQuery) => {
      const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return request<TrafficMetricsResponse>(`/admin/metrics/traffic${qs.toString() ? `?${qs}` : ''}`);
    },
    getHotspots: async (query?: HotspotsQuery) => {
      const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return request<HotspotsResponse>(`/admin/metrics/hotspots${qs.toString() ? `?${qs}` : ''}`);
    },
    getActiveUsers: async (query?: ActiveUsersQuery) => {
      const qs = new URLSearchParams(
        Object.entries(query || {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      );
      return request<ActiveUsersResponse>(`/admin/metrics/active-users${qs.toString() ? `?${qs}` : ''}`);
    },
  },
  feedback: {
    list: async (params?: { limit?: number }) => {
      const qs = new URLSearchParams(
        Object.entries(params || {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      );
      return request<FeedbackListResponse>(`/admin/feedback${qs.toString() ? `?${qs}` : ''}`);
    },
  },
  rides: {
    getLogs: async (query?: RideLogsQuery) => {
      const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return request<RideLogsResponse>(`/admin/rides/logs${qs.toString() ? `?${qs}` : ''}`);
    },
  },
  users: {
    listMobile: async (params?: { limit?: number; q?: string; activeWithinHours?: number }) => {
      const qs = new URLSearchParams(
        Object.entries(params || {})
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      );
      return request<MobileUsersResponse>(`/admin/users/mobile${qs.toString() ? `?${qs}` : ''}`);
    },
  },
  support: {
    getThreads: async (query?: SupportThreadsQuery) => {
      const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
      return request<SupportThreadsResponse>(`/admin/support/threads${qs.toString() ? `?${qs}` : ''}`);
    },
    getMessages: async (id: string) => request<ThreadMessagesResponse>(`/admin/support/threads/${id}/messages`),
    reply: async (id: string, payload: ReplyRequest) =>
      request<ReplyResponse>(`/admin/support/threads/${id}/reply`, { method: 'POST', body: JSON.stringify(payload) }),
    updateThread: async (id: string, updates: PatchThreadRequest) =>
      request<PatchThreadResponse>(`/admin/support/threads/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  },
};
