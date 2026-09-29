import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  bulkInviteSchema,
  inviteMemberSchema,
  listMembersQuery,
  updateMemberSchema,
  type BulkInviteInput,
  type InviteMemberParsed,
  type ListMembersQuery,
  type UpdateMemberInput,
} from '@arc/validation';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { MembersService } from './members.service';

@ApiTags('members')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('members')
@RequirePermission('user.manage')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('member.view')
  list(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Query(new ZodValidationPipe(listMembersQuery)) q: ListMembersQuery,
  ) {
    return this.members.list(user, org, q);
  }

  @Get('summary')
  @RequirePermission('member.view')
  summary(@OrgContext() org: OrgContextInfo) {
    return this.members.counts(org);
  }

  /** Invite one person (creates their account if needed and emails them a link). */
  @Post()
  invite(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberParsed,
  ) {
    return this.members.invite(user, org, body);
  }

  /** Up to 500 rows parsed from CSV on the client. Returns a per-row report. */
  @Post('bulk')
  @HttpCode(200)
  bulk(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(bulkInviteSchema)) body: BulkInviteInput,
  ) {
    return this.members.bulkInvite(user, org, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ) {
    return this.members.update(user, org, id, body);
  }

  @Post(':id/resend-invite')
  @HttpCode(200)
  resend(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    return this.members.resendInvite(user, org, id);
  }
}
