/** The bell in the top bar: a feed built from announcements, exams and results. */
export type NotificationKind =
  'ANNOUNCEMENT' | 'EXAM_LIVE' | 'EXAM_SOON' | 'RESULT' | 'STAFF_EXAM_LIVE' | 'STAFF_MARKING';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** In-app link (e.g. /exam/<id>). */
  link: string | null;
  at: string;
  unread: boolean;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread: number;
}
