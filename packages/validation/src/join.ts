import { z } from 'zod';

/** Body for POST /join/:code — a student registering into a college. */
export const joinOrganizationSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  externalId: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  departmentId: z.uuid().optional().nullable(),
});
export type JoinOrganizationInput = z.input<typeof joinOrganizationSchema>;
export type JoinOrganizationParsed = z.output<typeof joinOrganizationSchema>;

export const setJoinSettingsSchema = z.object({ enabled: z.boolean() });

/** Normalises what a student types: " anurag-7k2q " → "ANURAG-7K2Q". */
export function normalizeJoinCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}
