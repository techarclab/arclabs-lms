import { Body, Controller, Delete, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  accessCodeEmailSchema,
  accessLoginSchema,
  type AccessCodeEmailInput,
  type AccessLoginInput,
} from '@arc/validation';
import type { AuthedRequest, OrgContextInfo } from '../auth/auth.types';
import {
  AccessCodeOnly,
  CurrentUser,
  OrgContext,
  Public,
  RequirePermission,
} from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { AccessService } from './access.service';

/** Faculty sign in with their college's access code (read-only). */
@ApiTags('access')
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Post('login')
  @HttpCode(200)
  @Public()
  login(
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(accessLoginSchema)) body: AccessLoginInput,
  ) {
    return this.access.login(body.code, {
      ip: req.ip,
      userAgent: req.header('user-agent') ?? undefined,
    });
  }

  @Get('me')
  @ApiBearerAuth()
  @AccessCodeOnly()
  me(@Req() req: AuthedRequest) {
    return this.access.me(req.accessSession!);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @AccessCodeOnly()
  async logout(@Req() req: AuthedRequest) {
    await this.access.logout(req.accessSession!.sessionId);
  }
}

/** College admins create, replace or switch off the faculty access code. */
@ApiTags('access')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('access-code')
@RequirePermission('user.manage')
export class AccessCodeController {
  constructor(private readonly access: AccessService) {}

  @Get()
  status(@OrgContext() org: OrgContextInfo) {
    return this.access.status(org.organizationId);
  }

  @Post()
  @HttpCode(200)
  generate(@CurrentUser() u: User, @OrgContext() org: OrgContextInfo) {
    return this.access.generate(u, org.organizationId);
  }

  @Post('email')
  @HttpCode(200)
  email(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(accessCodeEmailSchema)) body: AccessCodeEmailInput,
  ) {
    return this.access.emailCode(u, org.organizationId, body);
  }

  @Delete()
  disable(@CurrentUser() u: User, @OrgContext() org: OrgContextInfo) {
    return this.access.disable(u, org.organizationId);
  }
}
