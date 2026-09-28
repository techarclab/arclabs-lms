import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@arc/types';
import type { AuthedRequest } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Route needs no authentication (health, public catalog, certificate verify). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_UNREGISTERED = 'allowUnregistered';
/** Valid Firebase token is enough; the Postgres user row may not exist yet (POST /auth/sync). */
export const AllowUnregistered = () => SetMetadata(ALLOW_UNREGISTERED, true);

export const REQUIRED_PERMISSION = 'requiredPermission';
/** Requires X-Org-Id membership holding this permission (Super Admin always passes). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

export const SUPER_ADMIN_ONLY = 'superAdminOnly';
/** Platform-level routes (create organizations, platform analytics). */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY, true);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

export const FirebaseIdentity = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().firebase,
);

export const OrgContext = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().org,
);
