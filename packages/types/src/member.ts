export type MemberState = 'ACTIVE' | 'INVITED' | 'INACTIVE';

export interface MemberSummary {
  id: string; // membership id
  userId: string;
  fullName: string;
  email: string; // sign-in email
  collegeEmail: string | null; // announcements go here when set
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
  learnerCount: number;
  staffCount: number;
  /** The department's own registration link code (null until created). */
  joinCode: string | null;
  joinEnabled: boolean;
}

export interface DepartmentStudent {
  userId: string;
  fullName: string;
  email: string;
  collegeEmail: string | null;
  externalId: string | null;
  joinedAt: string;
}

export interface DepartmentDetail extends DepartmentSummary {
  staff: { userId: string; fullName: string; email: string; roles: string[] }[];
  counts: { exams: number; materials: number; labs: number; announcements: number };
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
  /** Blind copies (announcements go out in batches). */
  bcc?: string[];
  replyTo?: string;
}

/** People in one college who look like the same student (same roll number or college email). */
export interface DuplicateGroup {
  /** What they share, e.g. "Roll no. 21J41A0168" */
  reasons: string[];
  /** Suggested account to keep (most exam attempts, then most recent sign-in). */
  keepId: string;
  members: (MemberSummary & { attempts: number; labMarks: number })[];
}

export interface MergeResult {
  merged: number;
  moved: { attempts: number; labMarks: number; other: number };
  kept: MemberSummary;
}
