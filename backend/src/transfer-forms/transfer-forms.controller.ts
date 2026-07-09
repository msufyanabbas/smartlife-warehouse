import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { TransferFormsService } from './transfer-forms.service';
import { CreateTransferFormDto, UpdateTransferFormDto } from './dto/transfer-form.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('transfer-forms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferFormsController {
  constructor(private transferFormsService: TransferFormsService) {}

  @Get()
  findAll() {
    return this.transferFormsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transferFormsService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateTransferFormDto) {
    return this.transferFormsService.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateTransferFormDto) {
    return this.transferFormsService.update(id, dto);
  }
}
