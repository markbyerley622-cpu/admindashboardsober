// =============================================================================
// AUTH HOOK - Client-side authentication state management
// =============================================================================
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Admin, LoginCredentials } from '@/types';
import * as api from '@/lib/api';

interface UseAuthReturn {
  admin: Admin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = api.getAccessToken();
        if (!token) {
          setIsLoading(false);
          return;
        }

        // Try to get cached user first
        const cachedUser = localStorage.getItem('admin_user');
        if (cachedUser) {
          setAdmin(JSON.parse(cachedUser));
        }

        // Verify token is still valid
        const currentAdmin = await api.getCurrentAdmin();
        if (currentAdmin) {
          setAdmin(currentAdmin);
          localStorage.setItem('admin_user', JSON.stringify(currentAdmin));
        } else {
          // Token invalid, clear everything
          api.clearTokens();
          setAdmin(null);
        }
      } catch (err) {
        api.clearTokens();
        setAdmin(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await api.login(credentials);
      setAdmin(result.admin);
      router.push('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAdmin(null);
      router.push('/login');
    }
  }, [router]);

  return {
    admin,
    isLoading,
    isAuthenticated: !!admin,
    login,
    logout,
    error,
  };
}

// =============================================================================
// PROTECTED ROUTE HOOK
// =============================================================================
export function useRequireAuth(): UseAuthReturn & { ready: boolean } {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      router.push('/login');
    }
  }, [auth.isLoading, auth.isAuthenticated, router]);

  return {
    ...auth,
    ready: !auth.isLoading && auth.isAuthenticated,
  };
}
