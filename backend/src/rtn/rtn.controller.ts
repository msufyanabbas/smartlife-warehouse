import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { RtnService } from './rtn.service';
import { CreateRtnDto, ReviewRtnDto, UpdateRtnDto } from './dto/rtn.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

// Raising a return is open to any signed-in user: the worker handing the stock
// back is the one who fills it in. Only the review is restricted.
@Controller('rtn')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RtnController {
  constructor(private rtnService: RtnService) {}

  @Get()
  findAll() {
    return this.rtnService.findAll();
  }

  // Declared before `:id` so "pending" is not read as a document id.
  @Get('pending')
  findPending() {
    return this.rtnService.findPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rtnService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRtnDto, @CurrentUser() user: User) {
    return this.rtnService.create(dto, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRtnDto) {
    return this.rtnService.update(id, dto);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN, Role.MANAGER)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewRtnDto,
    @CurrentUser() user: User,
  ) {
    return this.rtnService.review(id, dto, user);
  }
}
