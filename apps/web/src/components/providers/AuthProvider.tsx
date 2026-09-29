'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut as fbSignOut, type User as FbUser } from 'firebase/auth';
import type { AccessLoginResponse, MeResponse } from '@arc/types';
import { ACCESS_EXPIRED_EVENT, api } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';

const ACCESS_KEY = 'arc.accessToken';

function readAccessToken() {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}
function writeAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ACCESS_KEY, token);
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    /* private mode — the session just won't survive a reload */
  }
}

interface AuthState {
  loading: boolean;
  firebaseUser: FbUser | null;
  /** True when signed in either with a Firebase account or a college access code. */
  signedIn: boolean;
  /** Signed in with a college access code (read-only faculty view). */
  accessCode: boolean;
  me: MeResponse | null;
  error: string | null;
  getToken: () => Promise<string | undefined>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  loginWithAccessCode: (code: string) => Promise<MeResponse>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbLoading, setFbLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FbUser | null>(null);
  const [fbMe, setFbMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [accessLoading, setAccessLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accessMe, setAccessMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    return onIdTokenChanged(firebaseAuth(), async (user) => {
      setFirebaseUser(user);
      setError(null);
      if (!user) {
        setFbMe(null);
        setFbLoading(false);
        return;
      }
      // A real account signs in: drop any access-code session on this browser.
      writeAccessToken(null);
      setAccessToken(null);
      setAccessMe(null);
      try {
        const token = await user.getIdToken();
        // Creates the LMS user on first sign-in, refreshes it afterwards.
        setFbMe(await api<MeResponse>('/auth/sync', { method: 'POST', body: {}, token }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the API');
      } finally {
        setFbLoading(false);
      }
    });
  }, []);

  // Restore a faculty access-code session saved in this browser.
  useEffect(() => {
    const token = readAccessToken();
    if (!token) {
      setAccessLoading(false);
      return;
    }
    api<MeResponse>('/access/me', { token })
      .then((m) => {
        setAccessToken(token);
        setAccessMe(m);
      })
      .catch(() => writeAccessToken(null))
      .finally(() => setAccessLoading(false));
  }, []);

  const clearAccess = useCallback(() => {
    writeAccessToken(null);
    setAccessToken(null);
    setAccessMe(null);
  }, []);

  // The API says the access session expired or the code was changed → back to the login page.
  useEffect(() => {
    const onExpired = () => clearAccess();
    window.addEventListener(ACCESS_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(ACCESS_EXPIRED_EVENT, onExpired);
  }, [clearAccess]);

  const getToken = useCallback(async () => {
    const fb = firebaseAuth().currentUser;
    if (fb) return fb.getIdToken();
    return accessToken ?? undefined;
  }, [accessToken]);

  const signOut = useCallback(async () => {
    if (accessToken) {
      await api('/access/logout', { method: 'POST', token: accessToken }).catch(() => undefined);
      clearAccess();
    }
    await fbSignOut(firebaseAuth());
  }, [accessToken, clearAccess]);

  const refresh = useCallback(async () => {
    const token = await firebaseAuth().currentUser?.getIdToken();
    if (token) setFbMe(await api<MeResponse>('/auth/me', { token }));
    else if (accessToken) setAccessMe(await api<MeResponse>('/access/me', { token: accessToken }));
  }, [accessToken]);

  const loginWithAccessCode = useCallback(async (code: string) => {
    const res = await api<AccessLoginResponse>('/access/login', {
      method: 'POST',
      body: { code },
    });
    const m = await api<MeResponse>('/access/me', { token: res.token });
    if (firebaseAuth().currentUser) await fbSignOut(firebaseAuth());
    try {
      localStorage.setItem('arc.currentOrgId', res.organizationId);
    } catch {
      /* ignore */
    }
    writeAccessToken(res.token);
    setAccessToken(res.token);
    setAccessMe(m);
    return m;
  }, []);

  const accessCode = !firebaseUser && Boolean(accessToken && accessMe);
  const me = firebaseUser ? fbMe : accessMe;

  return (
    <AuthContext.Provider
      value={{
        loading: fbLoading || accessLoading,
        firebaseUser,
        signedIn: Boolean(firebaseUser) || accessCode,
        accessCode,
        me,
        error: firebaseUser ? error : null,
        getToken,
        signOut,
        refresh,
        loginWithAccessCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
