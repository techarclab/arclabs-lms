import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Layers,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { hasPermission, type OrgRole, type Permission } from '@arc/types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown to Super Admin always; to members when a role grants it. */
  permission?: Permission;
  superAdminOnly?: boolean;
  learnerOnly?: boolean;
  soon?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Organizations', href: '/organizations', icon: Building2, superAdminOnly: true },
    ],
  },
  {
    title: 'Training',
    items: [
      {
        label: 'Courses',
        href: '/courses',
        icon: BookOpen,
        permission: 'course.manage',
        soon: true,
      },
      {
        label: 'Programs',
        href: '/programs',
        icon: Layers,
        permission: 'program.view',
        soon: true,
      },
      {
        label: 'Batches',
        href: '/batches',
        icon: CalendarRange,
        permission: 'batch.manage',
        soon: true,
      },
      {
        label: 'Assessments',
        href: '/assessments',
        icon: ClipboardCheck,
        permission: 'quiz.author',
        soon: true,
      },
      {
        label: 'Certificates',
        href: '/certificates',
        icon: Award,
        permission: 'certificate.issue',
        soon: true,
      },
    ],
  },
  {
    title: 'My learning',
    items: [
      { label: 'My courses', href: '/learn', icon: GraduationCap, learnerOnly: true, soon: true },
      {
        label: 'My certificates',
        href: '/my-certificates',
        icon: Award,
        learnerOnly: true,
        soon: true,
      },
    ],
  },
  {
    title: 'People & insights',
    items: [
      { label: 'People', href: '/users', icon: Users, permission: 'user.manage' },
      {
        label: 'Analytics',
        href: '/analytics',
        icon: BarChart3,
        permission: 'analytics.view',
        soon: true,
      },
      {
        label: 'Audit log',
        href: '/audit',
        icon: ScrollText,
        permission: 'audit.view',
        soon: true,
      },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    permission: 'org.settings.manage',
    soon: true,
  },
];

export function visibleSections(isSuperAdmin: boolean, roles: string[]): NavSection[] {
  const r = roles as OrgRole[];
  const show = (i: NavItem) => {
    if (i.superAdminOnly) return isSuperAdmin;
    if (i.learnerOnly) return !isSuperAdmin && r.includes('LEARNER');
    if (!i.permission) return true;
    return isSuperAdmin || hasPermission(r, i.permission);
  };
  return NAV.map((s) => ({ ...s, items: s.items.filter(show) })).filter((s) => s.items.length);
}

export function visibleFooter(isSuperAdmin: boolean, roles: string[]) {
  return NAV_FOOTER.filter(
    (i) => isSuperAdmin || (i.permission && hasPermission(roles as OrgRole[], i.permission)),
  );
}
