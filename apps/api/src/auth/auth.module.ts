import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { firebaseAuthProvider } from './firebase-admin.provider';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { TenantGuard } from './tenant.guard';

@Module({
  controllers: [AuthController],
  providers: [
    firebaseAuthProvider,
    AuthService,
    PasswordResetService,
    // Order matters: authenticate first, then organization/permission check.
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [firebaseAuthProvider, AuthService],
})
export class AuthModule {}
