import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsIn, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { RtnItemCondition, RtnStatus } from '../entities/rtn-document.entity';
import { joinSerials } from '../../common/utils/serial-numbers';

export class RtnItemDto {
  @IsOptional() @IsString()
  itemCode?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  @IsOptional() @IsString()
  unit?: string;

  @IsOptional() @IsNumber() @Min(0)
  qtyReturned?: number;

  // A line covering several units may carry one serial per unit, so the client
  // is free to send an array; it is flattened to the stored comma-separated form
  // before validation.
  @IsOptional() @Transform(({ value }) => joinSerials(value)) @IsString()
  serialNumbers?: string | string[];

  @IsOptional() @IsEnum(RtnItemCondition)
  condition?: RtnItemCondition;

  @IsOptional() @IsString()
  reason?: string;

  @IsOptional() @IsUUID()
  itemId?: string;
}

export class CreateRtnDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsUUID()
  returnedById?: string;

  @IsOptional() @IsUUID()
  receivedById?: string;

  @IsOptional() @IsString()
  projectSite?: string;

  @IsOptional() @IsString()
  warehouseLocation?: string;

  @IsOptional() @IsString()
  notes?: string;

  // Approval-only statuses are refused here — they are reached through
  // PATCH /rtn/:id/review so the approver is taken from the token.
  @IsOptional() @IsEnum(RtnStatus)
  status?: RtnStatus;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RtnItemDto)
  items?: RtnItemDto[];
}

export class UpdateRtnDto extends PartialType(CreateRtnDto) {}

export class ReviewRtnDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional() @IsString()
  rejectionReason?: string;
}
