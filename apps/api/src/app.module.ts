import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './common/redis.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, StorageModule, AuthModule, HealthModule],
})
export class AppModule {}
