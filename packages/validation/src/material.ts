import { z } from 'zod';
import { normalizeMaterialUrl } from '@arc/types';

export const MATERIAL_TYPES = [
  'pdf',
  'slides',
  'doc',
  'sheet',
  'video',
  'image',
  'code',
  'zip',
  'folder',
  'link',
] as const;

const link = z
  .string()
  .trim()
  .min(1, 'Paste a link')
  .max(2000)
  .transform((v, ctx) => {
    const u = normalizeMaterialUrl(v);
    if (!u) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid link (https://…)' });
      return z.NEVER;
    }
    return u;
  });

const materialFields = {
  title: z.string().trim().min(2, 'Enter a title').max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null),
  url: link,
  /** null: guess from the link */
  fileType: z.enum(MATERIAL_TYPES).nullable(),
  folderId: z.uuid().nullable(),
  allowDownload: z.boolean(),
  published: z.boolean(),
  assignToAll: z.boolean(),
  departmentIds: z.array(z.uuid()).max(200),
};

export const createMaterialSchema = z
  .object({
    ...materialFields,
    fileType: materialFields.fileType.default(null),
    folderId: materialFields.folderId.default(null),
    allowDownload: materialFields.allowDownload.default(true),
    published: materialFields.published.default(true),
    assignToAll: materialFields.assignToAll.default(true),
    departmentIds: materialFields.departmentIds.default([]),
  })
  .refine((m) => m.assignToAll || m.departmentIds.length > 0, {
    message: 'Choose at least one department, or share with all students',
    path: ['departmentIds'],
  });
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = z
  .object(materialFields)
  .partial()
  .refine((m) => !(m.assignToAll === false && m.departmentIds && !m.departmentIds.length), {
    message: 'Choose at least one department, or share with all students',
    path: ['departmentIds'],
  });
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

export const materialFolderSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  parentId: z.uuid().nullish(),
});
export type MaterialFolderInput = z.infer<typeof materialFolderSchema>;

export const renameFolderSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
});

export const materialOpenSchema = z.object({
  action: z.enum(['view', 'download']),
});
export type MaterialOpenInput = z.infer<typeof materialOpenSchema>;
