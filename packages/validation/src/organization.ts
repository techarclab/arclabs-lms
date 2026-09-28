import { z } from 'zod';
import { slug } from './common';

export const orgTypeSchema = z.enum(['PLATFORM', 'SCHOOL', 'COLLEGE', 'COMPANY', 'OTHER']);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug,
  type: orgTypeSchema.default('OTHER'),
  contactEmail: z.email().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = createOrganizationSchema.partial();
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
