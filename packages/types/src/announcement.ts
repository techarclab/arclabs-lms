/** One message to many students: emailed (college email first) and shown in their portal. */

export type AnnouncementAudience =
  | { type: 'all' }
  | { type: 'departments'; departmentIds: string[] }
  /** Students assigned to an exam; pendingOnly = only those who haven't submitted. */
  | { type: 'exam'; examId: string; pendingOnly: boolean };

export interface AudiencePreview {
  recipients: number;
  collegeEmails: number;
  personalEmails: number;
  /** Students without a college email (their login email is used). */
  missingCollegeEmail: { name: string; externalId: string | null; email: string }[];
  emailConfigured: boolean;
}

export interface AnnouncementItem {
  id: string;
  subject: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  kind: 'GENERAL' | 'EXAM_REMINDER';
  audienceLabel: string;
  recipients: number;
  emailed: number;
  collegeEmails: number;
  personalEmails: number;
  emailStatus: 'sent' | 'partial' | 'failed' | 'not_configured' | 'skipped';
  readCount: number;
  sentBy: string | null;
  createdAt: string;
}

export interface MyAnnouncement {
  id: string;
  subject: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  kind: 'GENERAL' | 'EXAM_REMINDER';
  organizationName: string;
  sentBy: string | null;
  createdAt: string;
  read: boolean;
}
