import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../lib/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: restore session from localStorage
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('wh_token');
      const savedUser = localStorage.getItem('wh_user');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch {
      localStorage.removeItem('wh_token');
      localStorage.removeItem('wh_user');
    } finally {
      // Always mark loading done — this unblocks AppLayout
      setIsLoading(false);
    }
  }, []);

 const login = async (email: string, password: string) => {
  const res = await api.post('/auth/login', { email, password });

  const payload = res.data?.data ?? res.data;
  const accessToken: string = payload?.accessToken;
  const userData: User = payload?.user;

  console.log('payload:', payload);           // ← add this
  console.log('accessToken:', accessToken);   // ← add this
  console.log('userData:', userData);         // ← add this

  if (!accessToken || !userData) {
    throw new Error('Unexpected response shape from server');
  }

  localStorage.setItem('wh_token', accessToken);
  localStorage.setItem('wh_user', JSON.stringify(userData));

  setToken(accessToken);
  setUser(userData);
  console.log('setUser called');              // ← add this
};

  const logout = () => {
    localStorage.removeItem('wh_token');
    localStorage.removeItem('wh_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}