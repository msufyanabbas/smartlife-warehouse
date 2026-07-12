import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { TransferFormStatus } from '../entities/transfer-form.entity';
import { joinSerials } from '../../common/utils/serial-numbers';

export class TransferFormItemDto {
  @IsOptional() @IsString()
  itemCode?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  @IsOptional() @IsString()
  unit?: string;

  @IsOptional() @IsNumber() @Min(0)
  stockQty?: number;

  @IsOptional() @IsNumber() @Min(0)
  qtyToTransfer?: number;

  // A line covering several units may carry one serial per unit, so the client
  // is free to send an array; it is flattened to the stored comma-separated form
  // before validation.
  @IsOptional() @Transform(({ value }) => joinSerials(value)) @IsString()
  serialNumber?: string | string[];

  @IsOptional() @IsUUID()
  itemId?: string;
}

export class CreateTransferFormDto {
  @IsOptional() @IsString()
  fromWarehouse?: string;

  @IsOptional() @IsString()
  fromProjectSite?: string;

  @IsOptional() @IsUUID()
  issuedById?: string;

  @IsOptional() @IsDateString()
  transferDate?: string;

  @IsOptional() @IsString()
  toWarehouse?: string;

  @IsOptional() @IsString()
  toProjectSite?: string;

  @IsOptional() @IsUUID()
  receivedById?: string;

  @IsOptional() @IsString()
  reasonForTransfer?: string;

  @IsOptional() @IsUUID()
  approvedById?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsEnum(TransferFormStatus)
  status?: TransferFormStatus;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferFormItemDto)
  items?: TransferFormItemDto[];
}

export class UpdateTransferFormDto extends PartialType(CreateTransferFormDto) {}
