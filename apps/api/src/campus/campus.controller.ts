import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  campusSettingsSchema,
  geocodeQuerySchema,
  type CampusSettingsInput,
} from '@arc/validation';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { CampusService } from './campus.service';

/** The college's campus location, used by exams that must be written on campus. */
@ApiTags('campus')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('campus')
export class CampusController {
  constructor(private readonly campus: CampusService) {}

  @Get()
  @RequirePermission('exam.results.view')
  get(@OrgContext() org: OrgContextInfo) {
    return this.campus.get(org.organizationId);
  }

  @Put()
  @RequirePermission('user.manage')
  set(
    @CurrentUser() u: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(campusSettingsSchema)) body: CampusSettingsInput,
  ) {
    return this.campus.set(u, org, body);
  }

  @Get('geocode')
  @RequirePermission('user.manage')
  geocode(@Query(new ZodValidationPipe(geocodeQuerySchema)) query: { q: string }) {
    return this.campus.geocode(query.q);
  }
}
