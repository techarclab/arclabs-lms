import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  organizationId?: string;
  action: string; // e.g. organization.created
  entityType: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ipAddress?: string;
}

/** Records important administrative actions (PRD §15). Failures never break the request. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: { ...entry, meta: (entry.meta ?? {}) as object },
      });
    } catch {
      /* swallow — audit must not block the action */
    }
  }
}
