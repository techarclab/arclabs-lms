import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import type { User } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';

/** The bell in the top bar (any signed-in person). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  feed(@CurrentUser() u: User) {
    return this.notifications.feed(u);
  }

  /** The bell was opened: everything shown so far is no longer "new". */
  @Post('seen')
  @HttpCode(200)
  seen(@CurrentUser() u: User) {
    return this.notifications.markSeen(u);
  }
}
