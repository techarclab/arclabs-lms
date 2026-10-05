import { z } from 'zod';
import { paginationQuery } from './common';

export const orgRoleSchema = z.enum([
  'ORG_ADMIN',
  'CONTENT_MANAGER',
  'INSTRUCTOR',
  'EVALUATOR',
  'LEARNER',
  'ORG_VIEWER',
]);
export const memberStatusFilter = z.enum(['ACTIVE', 'INVITED', 'INACTIVE']);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
  fullName: z.string().trim().min(2, 'Enter the person’s name').max(120),
  roles: z.array(orgRoleSchema).min(1, 'Pick at least one role').max(5),
  departmentId: z.uuid().optional().nullable(),
  externalId: optionalText(60), // roll number / employee id
  sendEmail: z.boolean().default(true),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;
export type InviteMemberParsed = z.output<typeof inviteMemberSchema>;

export const MAX_BULK_INVITES = 500;

export const bulkInviteSchema = z.object({
  rows: z
    .array(
      z.object({
        email: z.string(),
        fullName: z.string().optional(),
        roles: z.array(z.string()).optional(),
        department: z.string().optional(),
        externalId: z.string().optional(),
      }),
    )
    .min(1)
    .max(MAX_BULK_INVITES),
  defaultRoles: z.array(orgRoleSchema).min(1).default(['LEARNER']),
  sendEmail: z.boolean().default(true),
});
export type BulkInviteInput = z.input<typeof bulkInviteSchema>;

export const updateMemberSchema = z
  .object({
    roles: z.array(orgRoleSchema).min(1, 'Pick at least one role').max(5).optional(),
    departmentId: z.uuid().nullable().optional(),
    externalId: z.string().trim().max(60).nullable().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/** Take people out of the organization: the listed ones, or everyone deactivated. */
export const removeMembersSchema = z
  .object({
    ids: z.array(z.uuid()).max(500).optional(),
    allDeactivated: z.boolean().optional(),
  })
  .refine((v) => (v.ids?.length ?? 0) > 0 || v.allDeactivated, 'Select who to remove');
export type RemoveMembersInput = z.infer<typeof removeMembersSchema>;

export const listMembersQuery = paginationQuery.extend({
  role: orgRoleSchema.optional(),
  status: memberStatusFilter.optional(),
  departmentId: z.uuid().optional(),
});
export type ListMembersQuery = z.infer<typeof listMembersQuery>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

/**
 * Parses CSV text (header row required). Handles quoted fields and commas inside quotes.
 * Recognised headers (case-insensitive): email, name / full name, role(s), department, roll / id.
 */
export function parseMembersCsv(text: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  const key = (h: string) => {
    const k = h
      .trim()
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (k === 'email' || k === 'emailaddress') return 'email';
    if (k === 'name' || k === 'fullname') return 'fullName';
    if (k === 'role' || k === 'roles') return 'roles';
    if (k === 'department' || k === 'dept' || k === 'branch') return 'department';
    if (['roll', 'rollno', 'rollnumber', 'id', 'externalid', 'employeeid', 'studentid'].includes(k))
      return 'externalId';
    return null;
  };
  const keys = header.map(key);
  return body.map((cols) => {
    const r: {
      email: string;
      fullName?: string;
      roles?: string[];
      department?: string;
      externalId?: string;
    } = {
      email: '',
    };
    keys.forEach((k, i) => {
      const v = (cols[i] ?? '').trim();
      if (!k || !v) return;
      if (k === 'roles')
        r.roles = v
          .split(/[;|/]/)
          .map((s) => s.trim().toUpperCase().replace(/\s+/g, '_'))
          .filter(Boolean);
      else r[k] = v;
    });
    return r;
  });
}
