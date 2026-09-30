import type { Request } from 'express';
import type { OrgRole } from '@arc/types';
import type { User } from '../generated/prisma/client';

export interface FirebaseIdentityInfo {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

export interface OrgContextInfo {
  organizationId: string;
  roles: OrgRole[];
  /**
   * Set for faculty assigned to a department (not college admins): they only see and act on
   * that department's students, exams, materials, lab marks and announcements.
   */
  departmentId?: string | null;
}

export interface AuthedRequest extends Request {
  id?: string;
  firebase?: FirebaseIdentityInfo;
  user?: User;
  org?: OrgContextInfo;
  /** Set when the caller signed in with a college access code instead of a Firebase account. */
  accessSession?: { sessionId: string; organizationId: string; organizationName: string };
}
