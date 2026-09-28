import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { syncUserSchema, type SyncUserInput } from '@arc/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { AllowUnregistered, CurrentUser, FirebaseIdentity } from './decorators';
import type { FirebaseIdentityInfo } from './auth.types';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Call once after Firebase sign-in/sign-up; creates or refreshes the LMS user record. */
  @Post('sync')
  @HttpCode(200)
  @AllowUnregistered()
  async sync(
    @FirebaseIdentity() identity: FirebaseIdentityInfo,
    @Body(new ZodValidationPipe(syncUserSchema)) body: SyncUserInput,
  ) {
    const user = await this.auth.sync(identity, body ?? {});
    return this.auth.me(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.auth.me(user.id);
  }
}
