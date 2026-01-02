// =============================================================================
// API CLIENT - Typed API client for admin server
// =============================================================================
import type {
  ApiResponse,
  LoginCredentials,
  LoginResponse,
  SubmissionListItem,
  SubmissionDetail,
  DashboardStats,
  Admin,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// =============================================================================
// AUTH TOKEN MANAGEMENT
// =============================================================================
let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) {
    localStorage.setItem('admin_token', token);
  } else {
    localStorage.removeItem('admin_token');
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== 'undefined') {
    accessToken = localStorage.getItem('admin_token');
  }
  return accessToken;
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_user');
  }
}

// =============================================================================
// BASE FETCH FUNCTION
// =============================================================================
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAccessToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data: ApiResponse<T> = await response.json();

  // Handle token expiration
  if (response.status === 401) {
    clearTokens();
    window.location.href = '/login';
  }

  if (!response.ok && !data.error) {
    throw new Error(`HTTP ${response.status}`);
  }

  return data;
}

// =============================================================================
// AUTH ENDPOINTS
// =============================================================================
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Login failed');
  }

  // Store tokens
  setAccessToken(response.data.token);
  localStorage.setItem('admin_refresh_token', response.data.refreshToken);
  localStorage.setItem('admin_user', JSON.stringify(response.data.admin));

  return response.data;
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem('admin_refresh_token');
  if (refreshToken) {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore logout errors
    }
  }
  clearTokens();
}

export async function getCurrentAdmin(): Promise<Admin | null> {
  try {
    const response = await apiFetch<Admin>('/auth/me');
    if (response.success && response.data) {
      return response.data;
    }
  } catch {
    // Token invalid or expired
  }
  return null;
}

// =============================================================================
// SUBMISSIONS ENDPOINTS
// =============================================================================
export interface GetSubmissionsParams {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  wallet?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SubmissionsResponse {
  items: SubmissionListItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getSubmissions(
  params: GetSubmissionsParams = {}
): Promise<SubmissionsResponse> {
  const searchParams = new URLSearchParams();

  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.status) searchParams.set('status', params.status);
  if (params.category) searchParams.set('category', params.category);
  if (params.wallet) searchParams.set('wallet', params.wallet);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const queryString = searchParams.toString();
  const endpoint = `/submissions${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<SubmissionListItem[]>(endpoint);

  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to fetch submissions');
  }

  return {
    items: response.data || [],
    meta: response.meta || { page: 1, limit: 20, total: 0, totalPages: 0 },
  };
}

export async function getSubmission(id: string): Promise<SubmissionDetail> {
  const response = await apiFetch<SubmissionDetail>(`/submissions/${id}`);

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Submission not found');
  }

  return response.data;
}

export async function getStats(): Promise<DashboardStats> {
  const response = await apiFetch<DashboardStats>('/submissions/stats');

  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Failed to fetch stats');
  }

  return response.data;
}

export async function getCategories(): Promise<string[]> {
  const response = await apiFetch<string[]>('/submissions/categories');

  if (!response.success || !response.data) {
    return [];
  }

  return response.data;
}

// =============================================================================
// MODERATION ACTIONS
// =============================================================================
export async function approveSubmission(
  id: string,
  moderatorNote?: string,
  txHash?: string
): Promise<void> {
  const response = await apiFetch(`/submissions/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ moderatorNote, txHash }),
  });

  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to approve submission');
  }
}

export async function rejectSubmission(
  id: string,
  reason: string,
  moderatorNote?: string
): Promise<void> {
  const response = await apiFetch(`/submissions/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason, moderatorNote }),
  });

  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to reject submission');
  }
}

export async function flagSubmission(id: string, reason: string): Promise<void> {
  const response = await apiFetch(`/submissions/${id}/flag`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to flag submission');
  }
}
