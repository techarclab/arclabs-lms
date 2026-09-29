/** Roles a user can hold inside one organization (mirrors Prisma enum OrgRole). */
export const ORG_ROLES = [
  'ORG_ADMIN',
  'CONTENT_MANAGER',
  'INSTRUCTOR',
  'EVALUATOR',
  'LEARNER',
  'ORG_VIEWER', // read-only: results, analytics and people (e.g. a college coordinator)
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
