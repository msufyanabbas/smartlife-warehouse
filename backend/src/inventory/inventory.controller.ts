import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  AddStockDto,
} from './dto/inventory.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.MANAGER)
  getStats() {
    return this.inventoryService.getStats();
  }

  // Must precede @Get(':id') or 'grn-receipts' is parsed as an item id.
  @Get('grn-receipts')
  getGrnReceipts() {
    return this.inventoryService.getGrnReceipts();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.create(dto);
  }

  @Post('bulk-import')
  @Roles(Role.ADMIN, Role.MANAGER)
  bulkImport(@Body() body: { items: CreateInventoryItemDto[] }) {
    return this.inventoryService.bulkCreate(body.items);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventoryService.update(id, dto);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN, Role.MANAGER)
  addStock(@Param('id') id: string, @Body() dto: AddStockDto) {
    return this.inventoryService.addStock(id, dto);
  }

  @Patch(':id/remove-stock')
  @Roles(Role.ADMIN, Role.MANAGER)
  removeStock(
    @Param('id') id: string,
    @Body() body: { quantity: number; reason?: string },
  ) {
    return this.inventoryService.removeStock(id, body.quantity, body.reason);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}