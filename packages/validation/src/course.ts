import { z } from 'zod';
import { slug } from './common';

export const createCourseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug,
  summary: z.string().trim().max(500).optional(),
  description: z.string().max(20000).optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  estimatedHours: z.number().int().min(0).max(2000).optional(),
  isPublic: z.boolean().default(false),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
