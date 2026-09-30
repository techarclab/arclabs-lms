import { Module } from '@nestjs/common';
import { MaterialsController, MyMaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  controllers: [MaterialsController, MyMaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
