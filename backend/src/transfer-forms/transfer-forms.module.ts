import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferFormsService } from './transfer-forms.service';
import { TransferFormsController } from './transfer-forms.controller';
import { TransferForm } from './entities/transfer-form.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransferForm, InventoryItem, Assignment, User])],
  providers: [TransferFormsService],
  controllers: [TransferFormsController],
  exports: [TransferFormsService],
})
export class TransferFormsModule {}
