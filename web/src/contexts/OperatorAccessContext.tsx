'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { operatorLogin } from '@/lib/realtime';

interface OperatorAccessContextType {
  isAuthenticated: boolean;
  /** The operator JWT, used for the socket handshake. */
  token: string | null;
  authenticate: (password: string) => Promise<boolean>;
  /** `reason` is shown on the login screen — e.g. why the session ended. */
  logout: (reason?: string) => void;
  /** Message to show on the login form, cleared once you sign in again. */
  notice: string | null;
}

const OperatorAccessContext = createContext<OperatorAccessContextType | undefined>(undefined);

const TOKEN_KEY = 'made_up_or_not_operator';

/**
 * Operator access. There is no server, so the password is checked in this
 * browser (realtime.ts → operatorLogin) — enough to keep a passer-by off the
 * operator page, not a real lock. The session lasts until the tab is closed.
 */
export function OperatorAccessProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore the session token on mount (survives a refresh, dies with the tab).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) setToken(stored);
  }, []);

  const authenticate = useCallback(async (password: string): Promise<boolean> => {
    const issued = await operatorLogin(password);
    if (!issued) return false;
    setToken(issued);
    setNotice(null);
    if (typeof window !== 'undefined') sessionStorage.setItem(TOKEN_KEY, issued);
    return true;
  }, []);

  const logout = useCallback((reason?: string) => {
    setToken(null);
    setNotice(reason ?? null);
    if (typeof window !== 'undefined') sessionStorage.removeItem(TOKEN_KEY);
  }, []);

  return (
    <OperatorAccessContext.Provider
      value={{ isAuthenticated: Boolean(token), token, authenticate, logout, notice }}
    >
      {children}
    </OperatorAccessContext.Provider>
  );
}

export function useOperatorAccess() {
  const context = useContext(OperatorAccessContext);
  if (context === undefined) {
    throw new Error('useOperatorAccess must be used within an OperatorAccessProvider');
  }
  return context;
}
