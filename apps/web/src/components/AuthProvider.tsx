'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut as fbSignOut, type User as FbUser } from 'firebase/auth';
import type { MeResponse } from '@arc/types';
import { api } from '@/lib/api';
import { firebaseAuth } from '@/lib/firebase';

interface AuthState {
  loading: boolean;
  firebaseUser: FbUser | null;
  me: MeResponse | null;
  error: string | null;
  getToken: () => Promise<string | undefined>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FbUser | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onIdTokenChanged(firebaseAuth(), async (user) => {
      setFirebaseUser(user);
      setError(null);
      if (!user) {
        setMe(null);
        setLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        // Creates the LMS user on first sign-in, refreshes it afterwards.
        setMe(await api<MeResponse>('/auth/sync', { method: 'POST', body: {}, token }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the API');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const getToken = useCallback(async () => firebaseAuth().currentUser?.getIdToken(), []);
  const signOut = useCallback(() => fbSignOut(firebaseAuth()), []);

  return (
    <AuthContext.Provider value={{ loading, firebaseUser, me, error, getToken, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
