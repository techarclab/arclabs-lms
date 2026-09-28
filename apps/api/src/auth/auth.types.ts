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
}

export interface AuthedRequest extends Request {
  id?: string;
  firebase?: FirebaseIdentityInfo;
  user?: User;
  org?: OrgContextInfo;
}
