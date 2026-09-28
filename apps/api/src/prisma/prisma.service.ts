import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        // Serverless instances each hold a pool; keep it small so Neon's limits aren't hit.
        max: process.env.VERCEL ? 5 : 10,
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
