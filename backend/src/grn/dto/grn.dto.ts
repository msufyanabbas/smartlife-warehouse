import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { GrnCondition, GrnStatus } from '../entities/grn-document.entity';

export class GrnItemDto {
  @IsOptional() @IsString()
  itemCode?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  @IsOptional() @IsString()
  unit?: string;

  @IsOptional() @IsNumber() @Min(0)
  orderedQty?: number;

  @IsOptional() @IsNumber() @Min(0)
  receivedQty?: number;

  @IsOptional() @IsString()
  serialNumber?: string;

  @IsOptional() @IsUUID()
  productId?: string;
}

export class CreateGrnDto {
  @IsOptional() @IsString()
  supplierName?: string;

  @IsOptional() @IsString()
  purchaseOrderNo?: string;

  @IsOptional() @IsDateString()
  dateOfReceipt?: string;

  @IsOptional() @IsString()
  deliveryNoteNo?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsUUID()
  receivedById?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsString()
  schemeNo?: string;

  @IsOptional() @IsEnum(GrnCondition)
  conditionOnArrival?: GrnCondition;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsEnum(GrnStatus)
  status?: GrnStatus;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnItemDto)
  items?: GrnItemDto[];
}

export class UpdateGrnDto extends PartialType(CreateGrnDto) {}
