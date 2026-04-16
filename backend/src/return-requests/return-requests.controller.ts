import {
  Controller, Get, Post, Patch, Body, Param, UseGuards,
} from '@nestjs/common';
import { ReturnRequestsService } from './return-requests.service';
import { CreateReturnRequestDto, ReviewReturnRequestDto } from './dto/request-return.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

@Controller('return-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnRequestsController {
  constructor(private returnRequestsService: ReturnRequestsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.returnRequestsService.findAll(user);
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.MANAGER, Role.WORKER)
  findPending() {
    return this.returnRequestsService.findPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnRequestsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateReturnRequestDto, @CurrentUser() user: User) {
    return this.returnRequestsService.create(dto, user);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN, Role.MANAGER)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewReturnRequestDto,
    @CurrentUser() user: User,
  ) {
    return this.returnRequestsService.review(id, dto, user);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: User) {
    return this.returnRequestsService.cancel(id, user);
  }
}