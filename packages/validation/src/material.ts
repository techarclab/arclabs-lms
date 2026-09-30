import { z } from 'zod';
import { MATERIAL_MAX_UPLOAD_MB, normalizeMaterialUrl, uploadExtension } from '@arc/types';

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

const fileName = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((n) => uploadExtension(n) !== null, 'This file type can’t be uploaded');

/** A file the browser has already uploaded to storage (path from /materials/upload-url). */
const uploadedFile = z.object({
  storagePath: z.string().min(10).max(500),
  fileName,
});

export const uploadUrlSchema = z.object({
  fileName,
  contentType: z.string().trim().max(200).default('application/octet-stream'),
  size: z
    .number()
    .int()
    .min(1, 'The file is empty')
    .max(MATERIAL_MAX_UPLOAD_MB * 1024 * 1024, `Files can be up to ${MATERIAL_MAX_UPLOAD_MB} MB`),
});
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;

const materialFields = {
  title: z.string().trim().min(2, 'Enter a title').max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || null),
  url: link.nullable(),
  file: uploadedFile.nullable(),
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
    url: materialFields.url.default(null),
    file: materialFields.file.default(null),
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
  })
  .refine((m) => Boolean(m.url) !== Boolean(m.file), {
    message: 'Paste a link or upload a file',
    path: ['url'],
  });
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

export const updateMaterialSchema = z
  .object(materialFields)
  .partial()
  .refine((m) => !(m.assignToAll === false && m.departmentIds && !m.departmentIds.length), {
    message: 'Choose at least one department, or share with all students',
    path: ['departmentIds'],
  })
  .refine((m) => !(m.url && m.file), { message: 'Use a link or a file, not both', path: ['url'] });
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
