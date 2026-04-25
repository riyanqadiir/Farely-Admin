import { createContext, useContext, useState, ReactNode } from 'react';
import { AdminUser } from '../types/dtos';
import { api } from '../api/mocks';

interface AuthContextType {
  user: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('farely_admin_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.auth.login({ email, password, rememberMe: true });
      if (res.success) {
        const userData = res.data.admin;
        setUser(userData);
        localStorage.setItem('farely_admin_user', JSON.stringify(userData));
        localStorage.setItem('farely_admin_access_token', res.data.accessToken);
        localStorage.setItem('farely_admin_refresh_token', res.data.refreshToken);
      }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('farely_admin_refresh_token');
    if (refreshToken) {
      try {
        await api.auth.logout({ refreshToken });
      } catch (_err) {
        // local session will still be cleared.
      }
    }
    setUser(null);
    localStorage.removeItem('farely_admin_user');
    localStorage.removeItem('farely_admin_access_token');
    localStorage.removeItem('farely_admin_refresh_token');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
