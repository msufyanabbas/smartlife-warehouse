import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto, ReturnAssignmentDto } from './dto/assignment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.assignmentsService.findAll(user);
  }

  @Get('worker/:workerId')
  @Roles(Role.ADMIN, Role.MANAGER)
  findByWorker(@Param('workerId') workerId: string) {
    return this.assignmentsService.findByWorker(workerId);
  }

  // Workers see their own; managers/admins see all active
  @Get('my-inventory')
  getMyInventory(@CurrentUser() user: User) {
    const isManager = user.role === Role.ADMIN || user.role === Role.MANAGER;
    if (isManager) {
      return this.assignmentsService.getAllActiveAssignments();
    }
    return this.assignmentsService.getWorkerInventory(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: User) {
    return this.assignmentsService.create(dto, user);
  }

  @Patch(':id/return')
  returnItems(
    @Param('id') id: string,
    @Body() dto: ReturnAssignmentDto,
    @CurrentUser() user: User,
  ) {
    return this.assignmentsService.returnItems(id, dto, user);
  }
}