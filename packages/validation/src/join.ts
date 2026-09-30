import { z } from 'zod';

/** Body for POST /join/:code — a student registering into a college. */
export const joinOrganizationSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  externalId: z
    .string()
    .trim()
    .min(1, 'Enter your roll number')
    .max(60)
    .transform((v) => v.toUpperCase()),
  departmentId: z.uuid({ message: 'Choose your department' }),
  /** The email the institution gave the student (announcements go here). */
  collegeEmail: z
    .email('Enter your college email')
    .trim()
    .max(200)
    .transform((v) => v.toLowerCase()),
});
export type JoinOrganizationInput = z.input<typeof joinOrganizationSchema>;
export type JoinOrganizationParsed = z.output<typeof joinOrganizationSchema>;

export const setJoinSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  /** e.g. ["mrec.edu.in"] — students must register with an email on one of these. */
  collegeEmailDomains: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .transform((d) => d.replace(/^@/, ''))
        .pipe(
          z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a domain like college.edu.in'),
        ),
    )
    .max(10)
    .optional(),
});

/** True when the email is on one of the domains (or a subdomain of one). Empty list = any. */
export function emailOnDomains(email: string, domains: readonly string[]) {
  if (!domains.length) return true;
  const host = email.trim().toLowerCase().split('@')[1] ?? '';
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export const setCollegeEmailSchema = z.object({
  organizationId: z.uuid(),
  collegeEmail: z
    .email('Enter your college email')
    .trim()
    .max(200)
    .transform((v) => v.toLowerCase()),
});
export type SetCollegeEmailInput = z.infer<typeof setCollegeEmailSchema>;

/** Normalises what a student types: " anurag-7k2q " → "ANURAG-7K2Q". */
export function normalizeJoinCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/** Body for POST /access/login — faculty signing in with the college access code. */
export const accessLoginSchema = z.object({
  code: z.string().trim().min(8, 'Enter the access code').max(64),
});
export type AccessLoginInput = z.input<typeof accessLoginSchema>;

/** "arc-7kq2 m9xd…" → "ARC7KQ2M9XD…": case, spaces and dashes don't matter. */
export function normalizeAccessCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Email the faculty access code (sent right after it's created, while the admin can see it). */
export const accessCodeEmailSchema = z.object({
  code: z.string().trim().min(8).max(64),
  emails: z
    .array(z.email('Enter valid email addresses').trim())
    .min(1, 'Add at least one email')
    .max(50, 'Up to 50 emails at a time'),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => v || null),
});
export type AccessCodeEmailInput = z.infer<typeof accessCodeEmailSchema>;
