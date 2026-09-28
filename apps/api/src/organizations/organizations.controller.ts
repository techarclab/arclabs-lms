import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createOrganizationSchema,
  listOrganizationsQuery,
  setOrganizationStatusSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type ListOrganizationsQuery,
  type SetOrganizationStatusInput,
  type UpdateOrganizationInput,
} from '@arc/validation';
import { CurrentUser, SuperAdminOnly } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** Super Admin: all organizations. Others: organizations they belong to. */
  @Get()
  list(
    @CurrentUser() user: User,
    @Query(new ZodValidationPipe(listOrganizationsQuery)) query: ListOrganizationsQuery,
  ) {
    return this.orgs.list(user, query);
  }

  @Post()
  @SuperAdminOnly()
  create(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
  ) {
    return this.orgs.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', UuidPipe) id: string) {
    return this.orgs.get(user, id);
  }

  /** Super Admin or Org Admin of this organization. */
  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
  ) {
    return this.orgs.update(user, id, body);
  }

  @Post(':id/status')
  @SuperAdminOnly()
  setStatus(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(setOrganizationStatusSchema)) body: SetOrganizationStatusInput,
  ) {
    return this.orgs.setStatus(user, id, body);
  }
}
