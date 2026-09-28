import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type OrgRole, type Permission } from '@arc/types';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_PERMISSION, SUPER_ADMIN_ONLY } from './decorators';
import type { AuthedRequest } from './auth.types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs after FirebaseAuthGuard. When a route declares @RequirePermission, the caller must send
 * X-Org-Id and hold an active membership in that org with a role granting the permission.
 * Sets req.org for services to scope every query by organizationId.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      const req = ctx.switchToHttp().getRequest<AuthedRequest>();
      if (!req.user?.isSuperAdmin) {
        throw new ForbiddenException({ message: 'Super Admin only' });
      }
      return true;
    }

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!permission) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException();

    const orgId = req.header('x-org-id');
    if (!orgId || !UUID_RE.test(orgId)) {
      throw new BadRequestException({
        code: 'ORG_REQUIRED',
        message: 'X-Org-Id header is required',
      });
    }

    if (user.isSuperAdmin) {
      req.org = { organizationId: orgId, roles: ['ORG_ADMIN'] };
      return true;
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      include: { organization: { select: { status: true } } },
    });
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      membership.organization.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException({ message: 'Not a member of this organization' });
    }
    const roles = membership.roles as OrgRole[];
    if (!hasPermission(roles, permission)) {
      throw new ForbiddenException({ message: `Missing permission: ${permission}` });
    }
    req.org = { organizationId: orgId, roles };
    return true;
  }
}
