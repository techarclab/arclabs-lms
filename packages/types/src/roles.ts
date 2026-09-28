/** Roles a user can hold inside one organization (mirrors Prisma enum OrgRole). */
export const ORG_ROLES = [
  'ORG_ADMIN',
  'CONTENT_MANAGER',
  'INSTRUCTOR',
  'EVALUATOR',
  'LEARNER',
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
