export interface JoinInfo {
  code: string;
  organizationId: string;
  organizationName: string;
  organizationType: string;
  primaryColor: string | null;
  departments: { id: string; name: string }[];
}

export interface JoinSettings {
  enabled: boolean;
  code: string | null;
  learnerCount: number;
}

export interface JoinResult {
  organizationId: string;
  organizationName: string;
  alreadyMember: boolean;
}
