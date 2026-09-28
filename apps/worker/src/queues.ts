/** Queue names shared with the API (API adds jobs, worker processes them). */
export const QUEUES = {
  email: 'email',
} as const;

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
