import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemRequestsService } from './item-requests.service';
import { ItemRequestsController } from './item-requests.controller';
import { ItemRequest } from './entities/item-request.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemRequest]),
    AssignmentsModule,
    InventoryModule,
  ],
  providers: [ItemRequestsService],
  controllers: [ItemRequestsController],
  exports: [ItemRequestsService],
})
export class ItemRequestsModule {}