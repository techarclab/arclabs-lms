import { Module } from '@nestjs/common';
import { AnnouncementsController, MyAnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  controllers: [AnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
