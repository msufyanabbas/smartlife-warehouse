import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentFormsService } from './assignment-forms.service';
import { AssignmentFormsController } from './assignment-forms.controller';
import { AssignmentForm } from './entities/assignment-form.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssignmentForm, Assignment, InventoryItem]),
    InventoryModule,
  ],
  providers: [AssignmentFormsService],
  controllers: [AssignmentFormsController],
  exports: [AssignmentFormsService],
})
export class AssignmentFormsModule {}
