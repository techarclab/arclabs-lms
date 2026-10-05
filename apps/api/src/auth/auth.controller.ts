import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  forgotPasswordSchema,
  syncUserSchema,
  type ForgotPasswordInput,
  type SyncUserInput,
} from '@arc/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { AllowUnregistered, CurrentUser, FirebaseIdentity, Public } from './decorators';
import { PasswordResetService } from './password-reset.service';
import type { AuthedRequest } from './auth.types';
import type { FirebaseIdentityInfo } from './auth.types';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly reset: PasswordResetService,
  ) {}

  /** "Forgot password": emails a reset link (always answers the same, account or not). */
  @Post('forgot-password')
  @HttpCode(200)
  @Public()
  forgotPassword(
    @Req() req: AuthedRequest,
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    return this.reset.request(body.email, req.ip);
  }

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
