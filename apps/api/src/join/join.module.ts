import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JoinController, JoinSettingsController } from './join.controller';
import { JoinService } from './join.service';

@Module({
  imports: [AuthModule],
  controllers: [JoinController, JoinSettingsController],
  providers: [JoinService],
})
export class JoinModule {}
