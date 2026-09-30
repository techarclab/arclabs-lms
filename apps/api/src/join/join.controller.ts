import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  joinOrganizationSchema,
  setCollegeEmailSchema,
  setJoinSettingsSchema,
  type JoinOrganizationParsed,
  type SetCollegeEmailInput,
} from '@arc/validation';
import type { FirebaseIdentityInfo, OrgContextInfo } from '../auth/auth.types';
import {
  AllowUnregistered,
  CurrentUser,
  FirebaseIdentity,
  OrgContext,
  Public,
  RequirePermission,
} from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { JoinService } from './join.service';

/** Students joining a college with its link / code. */
@ApiTags('join')
@Controller('join')
export class JoinController {
  constructor(private readonly join: JoinService) {}

  @Get(':code')
  @Public()
  info(@Param('code') code: string) {
    return this.join.info(code.slice(0, 40));
  }

  @Post(':code')
  @HttpCode(200)
  @ApiBearerAuth()
  @AllowUnregistered()
  register(
    @FirebaseIdentity() identity: FirebaseIdentityInfo,
    @CurrentUser() user: User | undefined,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(joinOrganizationSchema)) body: JoinOrganizationParsed,
  ) {
    return this.join.join(identity, user, code.slice(0, 40), body);
  }
}

/** Students add or correct their college email (for announcements). */
@ApiTags('join')
@ApiBearerAuth()
@Controller('my/college-email')
export class MyCollegeEmailController {
  constructor(private readonly join: JoinService) {}

  @Put()
  set(
    @CurrentUser() u: User,
    @Body(new ZodValidationPipe(setCollegeEmailSchema)) body: SetCollegeEmailInput,
  ) {
    return this.join.setCollegeEmail(u, body);
  }
}

/** College admins manage their organization's join link. */
@ApiTags('join')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('join-settings')
@RequirePermission('user.manage')
export class JoinSettingsController {
  constructor(private readonly join: JoinService) {}

  @Get()
  get(@OrgContext() org: OrgContextInfo) {
    return this.join.settings(org.organizationId);
  }

  @Put()
  set(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(setJoinSettingsSchema))
    body: { enabled?: boolean; collegeEmailDomains?: string[] },
  ) {
    if (body.collegeEmailDomains)
      return this.join
        .setDomains(u, org.organizationId, body.collegeEmailDomains)
        .then((s) =>
          body.enabled === undefined
            ? s
            : this.join.setEnabled(u, org.organizationId, body.enabled),
        );
    return this.join.setEnabled(u, org.organizationId, body.enabled ?? false);
  }

  @Post('regenerate')
  @HttpCode(200)
  regenerate(@CurrentUser() u: User, @OrgContext() org: OrgContextInfo) {
    return this.join.regenerate(u, org.organizationId);
  }
}
