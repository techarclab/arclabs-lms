/** Standard error body returned by every API error. */
export interface ApiErrorBody {
  error: {
    code: string; // e.g. VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, INTERNAL
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

/** Standard paginated list envelope. */
export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  version: string;
  checks: Record<string, 'up' | 'down' | 'skipped'>;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  memberships: {
    organizationId: string;
    organizationName: string;
    roles: string[];
    /** Institution email for announcements (students). */
    collegeEmail?: string | null;
    collegeEmailDomains?: string[];
  }[];
  /** True when signed in with a college access code (read-only, no personal account). */
  accessCode?: boolean;
}
