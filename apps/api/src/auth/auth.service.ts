import { Inject, Injectable } from '@nestjs/common';
import type { MeResponse } from '@arc/types';
import type { SyncUserInput } from '@arc/validation';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { FirebaseIdentityInfo } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Creates or updates the Postgres user for a signed-in Firebase identity. */
  async sync(identity: FirebaseIdentityInfo, input: SyncUserInput) {
    const email = identity.email?.toLowerCase();
    if (!email) throw new Error('Firebase account has no email');

    // Emails are trusted for linking/bootstrap only when verified (always true-ish in the local emulator).
    const trusted = identity.emailVerified || Boolean(this.env.FIREBASE_AUTH_EMULATOR_HOST);
    const makeSuperAdmin = trusted && email === this.env.SUPER_ADMIN_EMAIL?.toLowerCase();
    const fullName = input.fullName ?? identity.name ?? email.split('@')[0]!;

    const byUid = await this.prisma.user.findUnique({ where: { firebaseUid: identity.uid } });
    if (byUid) {
      return this.prisma.user.update({
        where: { id: byUid.id },
        data: {
          email,
          lastLoginAt: new Date(),
          ...(input.fullName ? { fullName: input.fullName } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          ...(makeSuperAdmin ? { isSuperAdmin: true } : {}),
        },
      });
    }

    // Pre-created by an admin (or emulator was reset): link by verified email.
    const byEmail = await this.prisma.user.findUnique({ where: { email } });
    if (byEmail && trusted) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          firebaseUid: identity.uid,
          lastLoginAt: new Date(),
          ...(makeSuperAdmin ? { isSuperAdmin: true } : {}),
        },
      });
    }

    return this.prisma.user.create({
      data: {
        firebaseUid: identity.uid,
        email,
        fullName,
        phone: input.phone,
        isSuperAdmin: makeSuperAdmin,
        lastLoginAt: new Date(),
      },
    });
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: { organization: { select: { id: true, name: true } } },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      memberships: user.memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        roles: m.roles,
      })),
    };
  }
}
