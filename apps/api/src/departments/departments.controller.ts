import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { DepartmentSummary } from '@arc/types';
import { createDepartmentSchema, type CreateDepartmentInput } from '@arc/validation';
import { AuditService } from '../audit/audit.service';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string): Promise<DepartmentSummary[]> {
    const rows = await this.prisma.department.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
    });
    return rows.map((d) => ({ id: d.id, name: d.name, memberCount: d._count.members }));
  }

  async create(
    actor: User,
    orgId: string,
    input: CreateDepartmentInput,
  ): Promise<DepartmentSummary> {
    const d = await this.prisma.department.create({
      data: { organizationId: orgId, name: input.name },
    });
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'department.created',
      entityType: 'department',
      entityId: d.id,
      meta: { name: d.name },
    });
    return { id: d.id, name: d.name, memberCount: 0 };
  }

  async remove(actor: User, orgId: string, id: string) {
    const d = await this.prisma.department.findFirst({ where: { id, organizationId: orgId } });
    if (!d) throw new NotFoundException();
    await this.prisma.department.delete({ where: { id } }); // members keep their membership (department set to null)
    await this.audit.log({
      actorId: actor.id,
      organizationId: orgId,
      action: 'department.deleted',
      entityType: 'department',
      entityId: id,
      meta: { name: d.name },
    });
  }
}

@ApiTags('departments')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermission('user.manage')
  list(@OrgContext() org: OrgContextInfo) {
    return this.departments.list(org.organizationId);
  }

  @Post()
  @RequirePermission('department.manage')
  create(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput,
  ) {
    return this.departments.create(user, org.organizationId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('department.manage')
  async remove(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.departments.remove(user, org.organizationId, id);
  }
}
