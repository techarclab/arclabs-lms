export interface JoinInfo {
  code: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
  primaryColor: string | null;
  departments: { id: string; name: string }[];
  /** Students must register with a college email on one of these domains (empty = any). */
  collegeEmailDomains: string[];
}

export interface JoinSettings {
  enabled: boolean;
  code: string | null;
  learnerCount: number;
  collegeEmailDomains: string[];
}

export interface JoinResult {
  organizationId: string;
  organizationName: string;
  alreadyMember: boolean;
}
