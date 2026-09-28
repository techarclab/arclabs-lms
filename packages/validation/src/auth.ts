import { z } from 'zod';

/** Body for POST /auth/sync — called after first Firebase sign-in. */
export const syncUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).optional(),
});
export type SyncUserInput = z.infer<typeof syncUserSchema>;
