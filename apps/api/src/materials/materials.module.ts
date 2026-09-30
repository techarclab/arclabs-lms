import { Module } from '@nestjs/common';
import { MaterialsController, MyMaterialsController } from './materials.controller';
import { FirebaseMaterialFiles, MATERIAL_FILES } from './file-storage';
import { MaterialsService } from './materials.service';

@Module({
  controllers: [MaterialsController, MyMaterialsController],
  providers: [MaterialsService, { provide: MATERIAL_FILES, useClass: FirebaseMaterialFiles }],
})
export class MaterialsModule {}
