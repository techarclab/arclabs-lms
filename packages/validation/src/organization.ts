import { z } from 'zod';
import { paginationQuery, slug } from './common';

export const orgTypeSchema = z.enum(['PLATFORM', 'SCHOOL', 'COLLEGE', 'COMPANY', 'OTHER']);
export const recordStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1F6AE0');

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(160),
  slug,
  type: orgTypeSchema.default('OTHER'),
  contactEmail: z
    .email('Enter a valid email')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  primaryColor: hexColor.optional().or(z.literal('').transform(() => undefined)),
});
export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  type: orgTypeSchema.optional(),
  contactEmail: z.email().nullable().optional(),
  primaryColor: hexColor.nullable().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const setOrganizationStatusSchema = z.object({
  status: recordStatusSchema,
  reason: z.string().trim().max(500).optional(),
});
export type SetOrganizationStatusInput = z.infer<typeof setOrganizationStatusSchema>;

export const listOrganizationsQuery = paginationQuery.extend({
  status: recordStatusSchema.optional(),
  type: orgTypeSchema.optional(),
});
export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuery>;

/** "ARC Labs Hyderabad" -> "arc-labs-hyderabad" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
