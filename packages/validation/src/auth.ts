import { z } from 'zod';

/** Body for POST /auth/sync — called after first Firebase sign-in. */
export const syncUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).optional(),
});
export type SyncUserInput = z.infer<typeof syncUserSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().max(200).pipe(z.email('Enter a valid email address')),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
