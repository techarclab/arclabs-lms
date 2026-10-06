import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { MergeService } from './merge.service';

@Module({
  imports: [AuthModule],
  controllers: [MembersController],
  providers: [MembersService, MergeService],
})
export class MembersModule {}
