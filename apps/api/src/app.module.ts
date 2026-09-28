import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './common/redis.module';
import { ConfigModule } from './config/config.module';
import { DepartmentsModule } from './departments/departments.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './mail/queue.module';
import { MembersModule } from './members/members.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    AuditModule,
    QueueModule,
    AuthModule,
    HealthModule,
    OrganizationsModule,
    AnalyticsModule,
    MembersModule,
    DepartmentsModule,
  ],
})
export class AppModule {}
