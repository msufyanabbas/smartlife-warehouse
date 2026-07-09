import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { GrnService } from './grn.service';
import { CreateGrnDto, UpdateGrnDto } from './dto/grn.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('grn')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GrnController {
  constructor(private grnService: GrnService) {}

  @Get()
  findAll() {
    return this.grnService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.grnService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateGrnDto) {
    return this.grnService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateGrnDto) {
    return this.grnService.update(id, dto);
  }
}
