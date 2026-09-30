import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OrgContextInfo } from '../auth/auth.types';

/**
 * Faculty assigned to a department (org.departmentId set) work only within it. These helpers are
 * shared by study materials and lab marks, which both have an "all students / departments" audience.
 */

/** Items such a faculty member can see: their own, college-wide ones and ones for their dept. */
export function visibleToDepartment(org: OrgContextInfo, userId: string) {
  if (!org.departmentId) return {};
  return {
    OR: [
      { createdById: userId },
      { assignToAll: true },
      { audiences: { some: { departmentId: org.departmentId } } },
    ],
  };
}

/** New / changed audience must stay inside the department. */
export function assertAudienceInDepartment(
  org: OrgContextInfo,
  audience: { assignToAll?: boolean; departmentIds?: string[] },
) {
  if (!org.departmentId) return;
  if (
    audience.assignToAll === true ||
    (audience.departmentIds ?? []).some((d) => d !== org.departmentId)
  )
    throw new ForbiddenException({
      code: 'OTHER_DEPARTMENTS',
      message: 'You can share only with students of your department.',
    });
}

/** Changing / deleting: allowed for your own items or ones only for your department. */
export function assertWritableInDepartment(
  org: OrgContextInfo,
  userId: string,
  item: { createdById: string | null; assignToAll: boolean; audiences: { departmentId: string }[] },
) {
  if (!org.departmentId || item.createdById === userId) return;
  const onlyMine =
    !item.assignToAll &&
    item.audiences.length > 0 &&
    item.audiences.every((a) => a.departmentId === org.departmentId);
  if (!onlyMine)
    throw new ForbiddenException({
      code: 'OTHER_DEPARTMENTS',
      message: 'This is shared with other departments — ask the college admin to change it.',
    });
}

export function assertVisibleInDepartment(
  org: OrgContextInfo,
  userId: string,
  item: { createdById: string | null; assignToAll: boolean; audiences: { departmentId: string }[] },
) {
  if (!org.departmentId) return;
  if (
    item.createdById === userId ||
    item.assignToAll ||
    item.audiences.some((a) => a.departmentId === org.departmentId)
  )
    return;
  throw new NotFoundException();
}
