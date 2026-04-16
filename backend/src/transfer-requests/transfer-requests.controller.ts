import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TransferRequestsService } from './transfer-requests.service';
import {
  CreateTransferRequestDto,
  ReviewTransferRequestDto,
} from './dto/transfer-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@Controller('transfer-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferRequestsController {
  constructor(private transferService: TransferRequestsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.transferService.findAll(user);
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.MANAGER, Role.WORKER)
  findPending() {
    return this.transferService.findPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transferService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTransferRequestDto, @CurrentUser() user: User) {
    return this.transferService.create(dto, user);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN, Role.MANAGER)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewTransferRequestDto,
    @CurrentUser() user: User,
  ) {
    return this.transferService.review(id, dto, user);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.transferService.cancel(id, user);
  }
}
