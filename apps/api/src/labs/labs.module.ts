import { Module } from '@nestjs/common';
import { LabsController, MyLabsController } from './labs.controller';
import { LabsService } from './labs.service';

@Module({ controllers: [LabsController, MyLabsController], providers: [LabsService] })
export class LabsModule {}
