import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentFormsService } from './assignment-forms.service';
import { AssignmentFormsController } from './assignment-forms.controller';
import { AssignmentForm } from './entities/assignment-form.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [TypeOrmModule.forFeature([AssignmentForm]), InventoryModule],
  providers: [AssignmentFormsService],
  controllers: [AssignmentFormsController],
  exports: [AssignmentFormsService],
})
export class AssignmentFormsModule {}
