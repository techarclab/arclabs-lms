export type MemberState = 'ACTIVE' | 'INVITED' | 'INACTIVE';

export interface MemberSummary {
  id: string; // membership id
  userId: string;
  fullName: string;
  email: string;
  roles: string[];
  state: MemberState;
  department: { id: string; name: string } | null;
  externalId: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
  isSelf: boolean;
}

export interface MemberCounts {
  total: number;
  active: number;
  invited: number;
  inactive: number;
  byRole: Record<string, number>;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  memberCount: number;
}

export interface InviteResult {
  member: MemberSummary;
  created: boolean; // false = existing user added to this org
  emailQueued: boolean;
  inviteLink?: string; // only returned in development, for testing without email
}

export interface BulkInviteRowResult {
  row: number;
  email: string;
  status: 'invited' | 'added' | 'skipped' | 'error';
  message?: string;
}

export interface BulkInviteResult {
  invited: number;
  added: number;
  skipped: number;
  errors: number;
  results: BulkInviteRowResult[];
}

/** Queue contract shared by the API (producer) and worker (consumer). */
export const QUEUES = { email: 'email' } as const;

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
