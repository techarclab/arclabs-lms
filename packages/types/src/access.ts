/** Admin view of an organization's faculty access code. The code itself is shown only once. */
export interface AccessCodeStatus {
  enabled: boolean;
  /** Last characters of the code, e.g. "…7KQ2", so admins can tell which code is live. */
  hint: string | null;
  createdAt: string | null;
  activeSessions: number;
}

export interface AccessCodeGenerated extends AccessCodeStatus {
  /** The full code — returned only at generation time. */
  code: string;
}

export interface AccessLoginResponse {
  token: string;
  organizationId: string;
  organizationName: string;
  expiresAt: string;
}
