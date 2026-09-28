'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { OrganizationSummary, Paginated } from '@arc/types';
import { useApi } from '@/lib/use-api';
import { useAuth } from './AuthProvider';

export interface OrgOption {
  id: string;
  name: string;
  type?: string;
  primaryColor?: string | null;
  roles: string[];
}

interface OrgState {
  /** null = platform view (Super Admin only) */
  current: OrgOption | null;
  options: OrgOption[];
  select: (id: string | null) => void;
  isSuperAdmin: boolean;
}

const OrgContext = createContext<OrgState | null>(null);
const STORAGE_KEY = 'arc.currentOrgId';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const isSuperAdmin = Boolean(me?.isSuperAdmin);
  const { data: allOrgs } = useApi<Paginated<OrganizationSummary>>(
    isSuperAdmin ? '/organizations?pageSize=100' : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setSelectedId(readStored()), []);

  const options = useMemo<OrgOption[]>(() => {
    if (isSuperAdmin) {
      return (allOrgs?.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        primaryColor: o.primaryColor,
        roles: ['SUPER_ADMIN'],
      }));
    }
    return (me?.memberships ?? []).map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
      roles: m.roles,
    }));
  }, [isSuperAdmin, allOrgs, me]);

  const current = useMemo(() => {
    const found = options.find((o) => o.id === selectedId);
    if (found) return found;
    // Super Admin defaults to platform view; members default to their first organization.
    return isSuperAdmin ? null : (options[0] ?? null);
  }, [options, selectedId, isSuperAdmin]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return (
    <OrgContext.Provider value={{ current, options, select, isSuperAdmin }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>');
  return ctx;
}
