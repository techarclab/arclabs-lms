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
});
export type JoinOrganizationInput = z.input<typeof joinOrganizationSchema>;
export type JoinOrganizationParsed = z.output<typeof joinOrganizationSchema>;

export const setJoinSettingsSchema = z.object({ enabled: z.boolean() });

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
