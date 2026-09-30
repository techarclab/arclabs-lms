import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  createLabSchema,
  saveLabMarksSchema,
  updateLabSchema,
  type CreateLabInput,
  type SaveLabMarksInput,
  type UpdateLabInput,
} from '@arc/validation';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { visibleToDepartment } from '../common/department-scope';
import { LabsService } from './labs.service';

/** Offline labs / project reviews: criteria-based marks entered by faculty. */
@ApiTags('labs')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('labs')
@RequirePermission('lab.marks')
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  @RequirePermission('lab.view')
  list(@CurrentUser() u: User, @OrgContext() org: OrgContextInfo) {
    return this.labs.list(org.organizationId, visibleToDepartment(org, u.id));
  }

  @Post()
  create(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(createLabSchema)) body: CreateLabInput,
  ) {
    this.labs.assertAudience(org, body);
    return this.labs.create(u, org.organizationId, body);
  }

  @Get(':id')
  @RequirePermission('lab.view')
  async sheet(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.labs.assertScope(org, u.id, id, false);
    return this.labs.sheet(org.organizationId, id, org.departmentId);
  }

  @Get(':id/marks.csv')
  @RequirePermission('lab.view')
  async csv(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Res() res: Response,
  ) {
    await this.labs.assertScope(org, u.id, id, false);
    const { filename, body } = await this.labs.csv(org.organizationId, id, org.departmentId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }

  @Patch(':id')
  async update(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateLabSchema)) body: UpdateLabInput,
  ) {
    await this.labs.assertScope(org, u.id, id, true);
    this.labs.assertAudience(org, body);
    const r = await this.labs.update(u, org.organizationId, id, body);
    return org.departmentId ? this.labs.sheet(org.organizationId, id, org.departmentId) : r;
  }

  @Put(':id/marks')
  async saveMarks(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(saveLabMarksSchema)) body: SaveLabMarksInput,
  ) {
    // Marking a college-wide lab for your own students is fine; the sheet only has them.
    await this.labs.assertScope(org, u.id, id, false);
    return this.labs.saveMarks(u, org.organizationId, id, body, org.departmentId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.labs.assertScope(org, u.id, id, true);
    await this.labs.remove(u, org.organizationId, id);
  }
}

/** Students: their lab marks, across colleges. */
@ApiTags('my labs')
@ApiBearerAuth()
@Controller('my/labs')
export class MyLabsController {
  constructor(private readonly labs: LabsService) {}

  @Get()
  mine(@CurrentUser() u: User) {
    return this.labs.mine(u);
  }
}
