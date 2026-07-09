import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AssignmentFormsService } from './assignment-forms.service';
import { CreateAssignmentFormDto, UpdateAssignmentFormDto } from './dto/assignment-form.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('assignment-forms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentFormsController {
  constructor(private assignmentFormsService: AssignmentFormsService) {}

  @Get()
  findAll() {
    return this.assignmentFormsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assignmentFormsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateAssignmentFormDto) {
    return this.assignmentFormsService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateAssignmentFormDto) {
    return this.assignmentFormsService.update(id, dto);
  }
}
