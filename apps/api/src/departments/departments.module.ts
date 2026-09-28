import { Module } from '@nestjs/common';
import { DepartmentsController, DepartmentsService } from './departments.controller';

@Module({ controllers: [DepartmentsController], providers: [DepartmentsService] })
export class DepartmentsModule {}
