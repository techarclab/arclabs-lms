import { z } from 'zod';

const criterion = z.object({
  id: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1, 'Name each criterion').max(120),
  max: z.number().positive('Max marks must be more than 0').max(1000),
});

const labFields = {
  title: z.string().trim().min(2, 'Enter a title').max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null),
  heldOn: z.iso.datetime({ offset: true }).nullish(),
  criteria: z
    .array(criterion)
    .min(1, 'Add at least one criterion')
    .max(20)
    .refine((c) => new Set(c.map((x) => x.id)).size === c.length, 'Criteria ids must be unique'),
  assignToAll: z.boolean(),
  departmentIds: z.array(z.uuid()).max(200),
};

export const createLabSchema = z
  .object({
    ...labFields,
    assignToAll: labFields.assignToAll.default(true),
    departmentIds: labFields.departmentIds.default([]),
  })
  .refine((l) => l.assignToAll || l.departmentIds.length > 0, {
    message: 'Choose at least one department, or all students',
    path: ['departmentIds'],
  });
export type CreateLabInput = z.infer<typeof createLabSchema>;

export const updateLabSchema = z
  .object(labFields)
  .partial()
  .refine((l) => !(l.assignToAll === false && l.departmentIds && !l.departmentIds.length), {
    message: 'Choose at least one department, or all students',
    path: ['departmentIds'],
  });
export type UpdateLabInput = z.infer<typeof updateLabSchema>;

export const saveLabMarksSchema = z.object({
  marks: z
    .array(
      z.object({
        userId: z.uuid(),
        scores: z.record(z.string(), z.number().min(0).nullable()),
        absent: z.boolean().default(false),
        remarks: z
          .string()
          .trim()
          .max(500)
          .nullish()
          .transform((v) => v || null),
      }),
    )
    .min(1)
    .max(500),
});
export type SaveLabMarksInput = z.infer<typeof saveLabMarksSchema>;
