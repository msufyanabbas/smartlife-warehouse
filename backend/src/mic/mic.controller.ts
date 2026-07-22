import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { MicService } from './mic.service';
import { CreateMicDto, ReviewMicDto, UpdateMicDto } from './dto/mic.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';

// Raising a MIC is open to any signed-in user: the worker who did the install
// is the one who fills it in. Only the review is restricted.
@Controller('mic')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MicController {
  constructor(private micService: MicService) {}

  @Get()
  findAll() {
    return this.micService.findAll();
  }

  // Declared before `:id` so "pending" is not read as a document id.
  @Get('pending')
  findPending() {
    return this.micService.findPending();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.micService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMicDto, @CurrentUser() user: User) {
    return this.micService.create(dto, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMicDto) {
    return this.micService.update(id, dto);
  }

  @Patch(':id/review')
  @Roles(Role.ADMIN, Role.MANAGER)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewMicDto,
    @CurrentUser() user: User,
  ) {
    return this.micService.review(id, dto, user);
  }
}
