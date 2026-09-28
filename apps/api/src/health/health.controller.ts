import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import type { HealthStatus } from '@arc/types';
import { Public } from '../auth/decorators';
import { REDIS } from '../common/redis.module';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @Public()
  async check(): Promise<HealthStatus> {
    const [db, cache] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.ping(),
    ]);
    const checks = { database: db, redis: cache };
    return {
      status: Object.values(checks).every((c) => c === 'up') ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
    };
  }

  private async ping(): Promise<'up' | 'down'> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
