import { hasPermission, permissionsFor } from '@arc/types';

describe('role permissions', () => {
  it('learners cannot mark attendance or grade', () => {
    expect(hasPermission(['LEARNER'], 'attendance.mark')).toBe(false);
    expect(hasPermission(['LEARNER'], 'submission.grade')).toBe(false);
  });

  it('instructors can mark attendance but cannot issue certificates', () => {
    expect(hasPermission(['INSTRUCTOR'], 'attendance.mark')).toBe(true);
    expect(hasPermission(['INSTRUCTOR'], 'certificate.issue')).toBe(false);
  });

  it('multiple roles combine', () => {
    const p = permissionsFor(['EVALUATOR', 'CONTENT_MANAGER']);
    expect(p.has('project.evaluate')).toBe(true);
    expect(p.has('course.publish')).toBe(true);
    expect(p.has('user.manage')).toBe(false);
  });
});
