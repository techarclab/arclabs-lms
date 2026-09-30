import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createMaterialSchema,
  materialFolderSchema,
  materialOpenSchema,
  renameFolderSchema,
  updateMaterialSchema,
  uploadUrlSchema,
  type UploadUrlInput,
  type CreateMaterialInput,
  type MaterialFolderInput,
  type MaterialOpenInput,
  type UpdateMaterialInput,
} from '@arc/validation';
import { normalizeMaterialUrl } from '@arc/types';
import type { OrgContextInfo } from '../auth/auth.types';
import { CurrentUser, OrgContext, RequirePermission } from '../auth/decorators';
import { UuidPipe } from '../common/uuid.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { User } from '../generated/prisma/client';
import { MaterialsService } from './materials.service';

const checkLinkSchema = z.object({ url: z.string().trim().min(1).max(2000) });

/** Admin / faculty: share study materials with students. */
@ApiTags('materials')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('materials')
@RequirePermission('material.manage')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  library(@OrgContext() org: OrgContextInfo) {
    return this.materials.library(org.organizationId);
  }

  /** Whether file uploads are set up (Firebase Storage). */
  @Get('storage')
  storage() {
    return this.materials.storageStatus();
  }

  @Post('upload-url')
  @HttpCode(200)
  uploadUrl(
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(uploadUrlSchema)) body: UploadUrlInput,
  ) {
    return this.materials.uploadUrl(org.organizationId, body);
  }

  @Post('check-link')
  @HttpCode(200)
  async checkLink(@Body(new ZodValidationPipe(checkLinkSchema)) body: { url: string }) {
    const url = normalizeMaterialUrl(body.url);
    if (!url) return { valid: false as const };
    return { valid: true as const, url, ...(await this.materials.checkLink(url)) };
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(createMaterialSchema)) body: CreateMaterialInput,
  ) {
    return this.materials.create(user, org.organizationId, body);
  }

  @Post('folders')
  createFolder(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Body(new ZodValidationPipe(materialFolderSchema)) body: MaterialFolderInput,
  ) {
    return this.materials.createFolder(user, org.organizationId, body);
  }

  @Patch('folders/:id')
  renameFolder(
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(renameFolderSchema)) body: { name: string },
  ) {
    return this.materials.renameFolder(org.organizationId, id, body.name);
  }

  @Delete('folders/:id')
  @HttpCode(204)
  async deleteFolder(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.materials.deleteFolder(user, org.organizationId, id);
  }

  @Get(':id/activity')
  activity(@OrgContext() org: OrgContextInfo, @Param('id', UuidPipe) id: string) {
    return this.materials.activity(org.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(updateMaterialSchema)) body: UpdateMaterialInput,
  ) {
    return this.materials.update(user, org.organizationId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: User,
    @OrgContext() org: OrgContextInfo,
    @Param('id', UuidPipe) id: string,
  ) {
    await this.materials.remove(user, org.organizationId, id);
  }
}

/** Students: materials shared with them (across their colleges), so no X-Org-Id is needed. */
@ApiTags('my materials')
@ApiBearerAuth()
@Controller('my/materials')
export class MyMaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.materials.myLibrary(user);
  }

  @Post(':id/open')
  @HttpCode(200)
  open(
    @CurrentUser() user: User,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(materialOpenSchema)) body: MaterialOpenInput,
  ) {
    return this.materials.open(user, id, body.action);
  }
}
