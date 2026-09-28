'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useOrg } from '@/components/providers/OrgProvider';
import { MemberDashboard } from '@/components/dashboard/MemberDashboard';
import { PlatformDashboard } from '@/components/dashboard/PlatformDashboard';

export default function DashboardPage() {
  const { me } = useAuth();
  const { current } = useOrg();
  if (me?.isSuperAdmin && !current) return <PlatformDashboard />;
  return <MemberDashboard />;
}
