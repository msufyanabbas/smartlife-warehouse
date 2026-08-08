import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RtnService } from './rtn.service';
import { RtnController } from './rtn.controller';
import { RtnDocument } from './entities/rtn-document.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RtnDocument, InventoryItem, Assignment])],
  providers: [RtnService],
  controllers: [RtnController],
  exports: [RtnService],
})
export class RtnModule {}
