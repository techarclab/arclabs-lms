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
  list(@OrgContext() org: OrgContextInfo) {
    return this.labs.list(org.organizationId);
  }

  @Post()
  create(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(createLabSchema)) body: CreateLabInput,
  ) {
    return this.labs.create(u, org.organizationId, body);
  }

  @Get(':id')
  @RequirePermission('lab.view')
  sheet(@OrgContext() org: OrgContextInfo, @Param('id', UuidPipe) id: string) {
    return this.labs.sheet(org.organizationId, id);
  }

  @Get(':id/marks.csv')
  @RequirePermission('lab.view')
  async csv(
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Res() res: Response,
  ) {
    const { filename, body } = await this.labs.csv(org.organizationId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateLabSchema)) body: UpdateLabInput,
  ) {
    return this.labs.update(u, org.organizationId, id, body);
  }

  @Put(':id/marks')
  saveMarks(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(saveLabMarksSchema)) body: SaveLabMarksInput,
  ) {
    return this.labs.saveMarks(u, org.organizationId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
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
