import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemUsageService } from './item-usage.service';
import { ItemUsageController } from './item-usage.controller';
import { ItemUsage } from './entities/item-usage.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemUsage]),
    AssignmentsModule,
    InventoryModule,
  ],
  providers: [ItemUsageService],
  controllers: [ItemUsageController],
  exports: [ItemUsageService],
})
export class ItemUsageModule {}