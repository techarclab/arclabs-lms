import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'firebase-admin/auth';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_UNREGISTERED, IS_PUBLIC } from './decorators';
import { FIREBASE_AUTH } from './firebase-admin.provider';
import type { AuthedRequest } from './auth.types';

/** Global guard: verifies the Firebase ID token and loads the Postgres user. */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(FIREBASE_AUTH) private readonly auth: Auth,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ message: 'Missing bearer token' });

    let decoded;
    try {
      decoded = await this.auth.verifyIdToken(token, true);
    } catch {
      throw new UnauthorizedException({ message: 'Invalid or expired token' });
    }
    req.firebase = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified ?? false,
      name: decoded.name as string | undefined,
    };

    const user = await this.prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (user) {
      if (user.status !== 'ACTIVE') {
        throw new ForbiddenException({
          code: 'ACCOUNT_DISABLED',
          message: 'Account is not active',
        });
      }
      req.user = user;
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_UNREGISTERED, targets)) return true;
    throw new ForbiddenException({
      code: 'USER_NOT_REGISTERED',
      message: 'Call POST /api/v1/auth/sync after signing in',
    });
  }
}
