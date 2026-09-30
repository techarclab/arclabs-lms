import { Module } from '@nestjs/common';
import { AccessModule } from './access/access.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './common/redis.module';
import { ConfigModule } from './config/config.module';
import { DepartmentsModule } from './departments/departments.module';
import { ExamsModule } from './exams/exams.module';
import { HealthModule } from './health/health.module';
import { JoinModule } from './join/join.module';
import { QueueModule } from './mail/queue.module';
import { MaterialsModule } from './materials/materials.module';
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
    AccessModule,
    AuthModule,
    HealthModule,
    OrganizationsModule,
    AnalyticsModule,
    MembersModule,
    DepartmentsModule,
    ExamsModule,
    JoinModule,
    MaterialsModule,
  ],
})
export class AppModule {}
