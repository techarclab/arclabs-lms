import { Global, Module } from '@nestjs/common';
import { AccessCodeController, AccessController } from './access.controller';
import { AccessService } from './access.service';

@Global()
@Module({
  controllers: [AccessController, AccessCodeController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
