import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { ItemCondition } from '../entities/inventory-item.entity';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  schemeNo: string;

  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsInt()
  @Min(0)
  totalQuantity: number;

  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  schemeNo?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddStockDto {
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateInventoryDto {
  items: CreateInventoryItemDto[];
}