import type { OrgRole } from './roles';

/**
 * Permission keys. Source of truth for docs/architecture/tenancy-and-rbac.md.
 * "Scoped" permissions (own / assigned) are further narrowed in the API service layer.
 */
export const PERMISSIONS = [
  'org.settings.manage',
  'department.manage',
  'user.manage',
  'user.role.assign',
  'course.manage',
  'course.publish',
  'course.view',
  'quiz.author',
  'material.manage', // share study materials with students and see who opened them
  'lab.marks', // create offline lab / project assessments and enter marks
  'lab.view', // see lab marks (read-only)
  'announcement.send', // email / post announcements and exam reminders to students
  'exam.results.view', // exam list, results, analytics, CSV (read-only)
  'member.view', // people list and departments (read-only)
  'department.view', // department pages and department lists (pickers)
  'program.manage',
  'program.view',
  'batch.manage',
  'batch.view',
  'enrollment.manage',
  'session.manage',
  'attendance.mark',
  'attendance.view',
  'assignment.manage',
  'submission.grade',
  'project.manage',
  'project.evaluate',
  'certificate.template.manage',
  'certificate.issue',
  'certificate.view',
  'analytics.view',
  'audit.view',
  'learning.participate', // consume content, attempt quizzes, submit work
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  ORG_ADMIN: [
    'org.settings.manage',
    'department.manage',
    'user.manage',
    'user.role.assign',
    'member.view',
    'department.view',
    'exam.results.view',
    'course.manage',
    'course.publish',
    'course.view',
    'quiz.author',
    'material.manage',
    'lab.marks',
    'lab.view',
    'announcement.send',
    'program.manage',
    'program.view',
    'batch.manage',
    'batch.view',
    'enrollment.manage',
    'session.manage',
    'attendance.mark',
    'attendance.view',
    'assignment.manage',
    'submission.grade',
    'project.manage',
    'project.evaluate',
    'certificate.template.manage',
    'certificate.issue',
    'certificate.view',
    'analytics.view',
    'audit.view',
  ],
  CONTENT_MANAGER: [
    'exam.results.view',
    'course.manage',
    'course.publish',
    'course.view',
    'quiz.author',
    'material.manage',
    'lab.marks',
    'lab.view',
    'department.view',
    'announcement.send',
    'program.view',
    'batch.view',
    'assignment.manage',
    'project.manage',
    'analytics.view',
  ],
  INSTRUCTOR: [
    'exam.results.view',
    'course.view',
    'quiz.author',
    'material.manage',
    'lab.marks',
    'lab.view',
    'department.view',
    'announcement.send',
    'program.view',
    'batch.view',
    'enrollment.manage',
    'session.manage',
    'attendance.mark',
    'attendance.view',
    'assignment.manage',
    'submission.grade',
    'project.manage',
    'project.evaluate',
    'certificate.view',
    'analytics.view',
  ],
  EVALUATOR: [
    'lab.marks',
    'lab.view',
    'department.view',
    'course.view',
    'batch.view',
    'submission.grade',
    'project.evaluate',
  ],
  LEARNER: [
    'course.view',
    'batch.view',
    'attendance.view',
    'certificate.view',
    'learning.participate',
    'analytics.view',
  ],
  /** College coordinator: sees everything about their organization's exams, changes nothing. */
  ORG_VIEWER: ['exam.results.view', 'member.view', 'department.view', 'analytics.view', 'lab.view'],
};

export function permissionsFor(roles: readonly OrgRole[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r]));
}

export function hasPermission(roles: readonly OrgRole[], permission: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r].includes(permission));
}
