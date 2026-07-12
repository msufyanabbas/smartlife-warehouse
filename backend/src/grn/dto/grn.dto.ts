import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { GrnCondition, GrnStatus } from '../entities/grn-document.entity';
import { joinSerials } from '../../common/utils/serial-numbers';

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

  // A line covering several units may carry one serial per unit, so the client
  // is free to send an array; it is flattened to the stored comma-separated form
  // before validation.
  @IsOptional() @Transform(({ value }) => joinSerials(value)) @IsString()
  serialNumber?: string | string[];

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
