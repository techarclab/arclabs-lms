import { Badge } from '@arc/ui';
import type { OrgType, RecordStatus } from '@arc/types';
import { ORG_TYPE_LABEL } from '@/lib/format';

export function StatusBadge({ status }: { status: RecordStatus }) {
  const map = {
    ACTIVE: { tone: 'success', label: 'Active' },
    INACTIVE: { tone: 'neutral', label: 'Inactive' },
    SUSPENDED: { tone: 'danger', label: 'Suspended' },
  } as const;
  const s = map[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: OrgType }) {
  const tone = (
    {
      PLATFORM: 'brand',
      SCHOOL: 'info',
      COLLEGE: 'violet',
      COMPANY: 'warning',
      OTHER: 'neutral',
    } as const
  )[type];
  return <Badge tone={tone}>{ORG_TYPE_LABEL[type]}</Badge>;
}
