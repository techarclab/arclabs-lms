import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * In a college, a roll number and a college email belong to one student. These helpers keep it
 * that way (and find students who registered more than once before this rule existed).
 */

/** "21j41a 0168 " → "21J41A0168" */
export function normRoll(v: string | null | undefined) {
  const s = (v ?? '').replace(/\s+/g, '').toUpperCase();
  return s || null;
}

export function normEmail(v: string | null | undefined) {
  const s = (v ?? '').trim().toLowerCase();
  return s || null;
}

/** "ravi.kumar@gmail.com" → "ra•••@gmail.com" (shown to someone who may not own the account) */
export function maskEmail(email: string) {
  const [user = '', host = ''] = email.split('@');
  return `${user.slice(0, 2)}•••@${host}`;
}

/**
 * Throws 409 if another person in the college already has this roll number or college email.
 * `forAdmin` shows the full email (admins may see it); students see it masked.
 */
export async function assertUniqueInCollege(
  prisma: PrismaService,
  orgId: string,
  values: { externalId?: string | null; collegeEmail?: string | null },
  exceptUserId: string | null,
  forAdmin: boolean,
) {
  const roll = normRoll(values.externalId);
  const cemail = normEmail(values.collegeEmail);
  if (!roll && !cemail) return;
  const clash = await prisma.organizationMember.findFirst({
    where: {
      organizationId: orgId,
      ...(exceptUserId ? { userId: { not: exceptUserId } } : {}),
      OR: [
        ...(roll ? [{ externalId: { equals: roll, mode: 'insensitive' as const } }] : []),
        ...(cemail ? [{ collegeEmail: { equals: cemail, mode: 'insensitive' as const } }] : []),
      ],
    },
    include: { user: { select: { email: true, fullName: true } } },
  });
  if (!clash) return;
  const byRoll = roll && normRoll(clash.externalId) === roll;
  const who = forAdmin
    ? `${clash.user.fullName} (${clash.user.email})`
    : `the account ${maskEmail(clash.user.email)}`;
  throw new ConflictException({
    code: byRoll ? 'ROLL_NUMBER_TAKEN' : 'COLLEGE_EMAIL_TAKEN',
    message: byRoll
      ? `Roll number ${roll} is already registered to ${who}.` +
        (forAdmin
          ? ''
          : ' Sign in with that account (use “Forgot password?” if needed) or ask your college admin.')
      : `College email ${cemail} is already registered to ${who}.` +
        (forAdmin
          ? ''
          : ' Sign in with that account (use “Forgot password?” if needed) or ask your college admin.'),
  });
}
