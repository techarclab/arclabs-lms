import { z } from 'zod';

export const announcementAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({
    type: z.literal('departments'),
    departmentIds: z.array(z.uuid()).min(1, 'Choose at least one department').max(200),
  }),
  z.object({ type: z.literal('exam'), examId: z.uuid(), pendingOnly: z.boolean().default(true) }),
]);

export const announcementSchema = z.object({
  subject: z.string().trim().min(3, 'Write a subject').max(200),
  body: z.string().trim().min(3, 'Write the message').max(10_000),
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null)
    .refine(
      (v) => !v || /^https?:\/\//i.test(v) || v.startsWith('/'),
      'Enter a full link (https://…)',
    ),
  linkLabel: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v || null),
  kind: z.enum(['GENERAL', 'EXAM_REMINDER']).default('GENERAL'),
  audience: announcementAudienceSchema,
  sendEmail: z.boolean().default(true),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const audiencePreviewSchema = z.object({ audience: announcementAudienceSchema });
