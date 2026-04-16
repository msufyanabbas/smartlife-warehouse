import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferRequestsService } from './transfer-requests.service';
import { TransferRequestsController } from './transfer-requests.controller';
import { TransferRequest } from './entities/transfer-request.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferRequest]),
    AssignmentsModule,
    InventoryModule,
  ],
  providers: [TransferRequestsService],
  controllers: [TransferRequestsController],
  exports: [TransferRequestsService],
})
export class TransferRequestsModule {}
