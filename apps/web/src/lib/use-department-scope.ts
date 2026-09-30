'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';

/**
 * Faculty assigned to a department only work with that department.
 * Returns that department for the current organization, or null (admins, super admin, unassigned staff).
 */
export function useDepartmentScope(): { id: string; name: string } | null {
  const { me } = useAuth();
  const { current, isSuperAdmin } = useOrg();
  if (isSuperAdmin || !current) return null;
  const m = me?.memberships.find((x) => x.organizationId === current.id);
  if (!m?.scopedDepartmentId) return null;
  return { id: m.scopedDepartmentId, name: m.department?.name ?? 'your department' };
}
