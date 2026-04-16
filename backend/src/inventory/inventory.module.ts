import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { InventoryItem } from './entities/inventory-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryItem])],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService, TypeOrmModule],
})
export class InventoryModule {}
