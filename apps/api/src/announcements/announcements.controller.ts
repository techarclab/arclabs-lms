import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { announcementSchema, audiencePreviewSchema, type AnnouncementInput } from '@arc/validation';
import type { AnnouncementAudience } from '@arc/types';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { AnnouncementsService } from './announcements.service';

/** Faculty send one message (or an exam reminder) to many students at once. */
@ApiTags('announcements')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('announcements')
@RequirePermission('announcement.send')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@OrgContext() org: OrgContextInfo) {
    return this.announcements.list(org.organizationId);
  }

  /** How many students it will reach, and how many have a college email. */
  @Post('preview')
  @HttpCode(200)
  preview(
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(audiencePreviewSchema)) body: { audience: AnnouncementAudience },
  ) {
    return this.announcements.preview(org.organizationId, body.audience);
  }

  @Post()
  send(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(announcementSchema)) body: AnnouncementInput,
  ) {
    return this.announcements.send(u, org.organizationId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.announcements.remove(u, org.organizationId, id);
  }
}

/** Students: announcements sent to them. */
@ApiTags('my announcements')
@ApiBearerAuth()
@Controller('my/announcements')
export class MyAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@CurrentUser() u: User) {
    return this.announcements.mine(u);
  }

  @Get('unread')
  unread(@CurrentUser() u: User) {
    return this.announcements.unread(u);
  }

  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() u: User) {
    return this.announcements.markRead(u);
  }
}
