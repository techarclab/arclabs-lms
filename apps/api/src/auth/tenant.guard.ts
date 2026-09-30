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
import { ACCESS_CODE_ONLY, REQUIRED_PERMISSION, SUPER_ADMIN_ONLY } from './decorators';
import type { AuthedRequest } from './auth.types';

const STAFF_ROLES: OrgRole[] = ['INSTRUCTOR', 'CONTENT_MANAGER', 'EVALUATOR'];

/** Faculty with a department (and no admin role) work only within that department. */
export function departmentScope(roles: OrgRole[], departmentId: string | null): string | null {
  if (!departmentId || roles.includes('ORG_ADMIN')) return null;
  return roles.some((r) => STAFF_ROLES.includes(r)) ? departmentId : null;
}

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
    const accessReq = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (accessReq.accessSession) return this.checkAccessSession(ctx, accessReq);

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
    req.org = { organizationId: orgId, roles, departmentId: departmentScope(roles, membership.departmentId) };
    return true;
  }

  /**
   * College access-code sessions are read-only and tied to one organization: they may reach only
   * routes marked @AccessCodeOnly or routes whose permission the ORG_VIEWER role holds, and only
   * for their own organization. Everything else (including routes with no permission, like /my/*)
   * is refused.
   */
  private checkAccessSession(ctx: ExecutionContext, req: AuthedRequest): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ACCESS_CODE_ONLY, targets)) return true;
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION,
      targets,
    );
    const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY, targets);
    const roles: OrgRole[] = ['ORG_VIEWER'];
    if (superOnly || !permission || !hasPermission(roles, permission))
      throw new ForbiddenException({
        code: 'READ_ONLY_ACCESS',
        message: 'Faculty access is view-only',
      });
    const orgId = req.header('x-org-id');
    if (orgId !== req.accessSession!.organizationId)
      throw new ForbiddenException({ message: 'Not allowed for this organization' });
    req.org = { organizationId: orgId, roles };
    return true;
  }
}
