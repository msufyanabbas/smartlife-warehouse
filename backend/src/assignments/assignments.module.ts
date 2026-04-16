import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { Assignment } from './entities/assignment.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [TypeOrmModule.forFeature([Assignment]), InventoryModule],
  providers: [AssignmentsService],
  controllers: [AssignmentsController],
  exports: [AssignmentsService, TypeOrmModule],
})
export class AssignmentsModule {}
