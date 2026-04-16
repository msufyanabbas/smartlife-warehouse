import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ItemUsageService } from './item-usage.service';
import { CreateItemUsageDto } from './dto/item-usage.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('item-usage')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemUsageController {
  constructor(private itemUsageService: ItemUsageService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.itemUsageService.findAll(user);
  }

  @Get('assignment/:assignmentId')
  findByAssignment(@Param('assignmentId') assignmentId: string) {
    return this.itemUsageService.findByAssignment(assignmentId);
  }

  @Get('worker/:workerId')
  findByWorker(@Param('workerId') workerId: string) {
    return this.itemUsageService.findByWorker(workerId);
  }

  @Post()
  create(@Body() dto: CreateItemUsageDto, @CurrentUser() user: User) {
    return this.itemUsageService.create(dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.itemUsageService.remove(id, user);
  }
}