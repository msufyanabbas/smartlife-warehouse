import {
  Controller, Get, Post, Patch, Body, Param, UseGuards,
} from '@nestjs/common';
import { ItemRequestsService } from './item-requests.service';
import { CreateItemRequestDto, ReviewItemRequestDto } from './dto/item-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@Controller('item-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemRequestsController {
  constructor(private itemRequestsService: ItemRequestsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.itemRequestsService.findAll(user);
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.MANAGER, Role.WORKER)
  findPending() {
    return this.itemRequestsService.findPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemRequestsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateItemRequestDto, @CurrentUser() user: User) {
    return this.itemRequestsService.create(dto, user);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN, Role.MANAGER)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewItemRequestDto,
    @CurrentUser() user: User,
  ) {
    return this.itemRequestsService.review(id, dto, user);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.itemRequestsService.cancel(id, user);
  }
}