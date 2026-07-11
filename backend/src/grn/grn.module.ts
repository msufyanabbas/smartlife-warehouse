import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrnService } from './grn.service';
import { GrnController } from './grn.controller';
import { GrnDocument } from './entities/grn-document.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GrnDocument, InventoryItem])],
  providers: [GrnService],
  controllers: [GrnController],
  exports: [GrnService],
})
export class GrnModule {}
