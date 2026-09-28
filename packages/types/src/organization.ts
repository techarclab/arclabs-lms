export type OrgType = 'PLATFORM' | 'SCHOOL' | 'COLLEGE' | 'COMPANY' | 'OTHER';
export type RecordStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  type: OrgType;
  status: RecordStatus;
  primaryColor: string | null;
  contactEmail: string | null;
  createdAt: string;
  counts: { members: number; courses: number; batches: number };
}

export interface OrganizationDetail extends OrganizationSummary {
  updatedAt: string;
  roleBreakdown: Record<string, number>;
  myRoles: string[];
  canManage: boolean;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  organizationName: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
}

export interface PlatformOverview {
  totals: {
    organizations: number;
    activeOrganizations: number;
    learners: number;
    instructors: number;
    publishedCourses: number;
    runningBatches: number;
    enrollments: number;
    completionRate: number; // 0..100
  };
  organizationsByType: Record<string, number>;
  recentOrganizations: OrganizationSummary[];
  recentActivity: ActivityItem[];
}
