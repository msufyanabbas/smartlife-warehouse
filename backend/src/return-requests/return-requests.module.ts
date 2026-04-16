import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnRequestsService } from './return-requests.service';
import { ReturnRequestsController } from './return-requests.controller';
import { ReturnRequest } from './entities/return-request.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReturnRequest]),
    AssignmentsModule,
    InventoryModule,
  ],
  providers: [ReturnRequestsService],
  controllers: [ReturnRequestsController],
  exports: [ReturnRequestsService],
})
export class ReturnRequestsModule {}