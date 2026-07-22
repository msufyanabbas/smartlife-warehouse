import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsIn, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { MicItemStatus, MicStatus } from '../entities/mic-document.entity';
import { joinSerials } from '../../common/utils/serial-numbers';

export class MicItemDto {
  @IsOptional() @IsString()
  itemCode?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  @IsOptional() @IsString()
  unit?: string;

  @IsOptional() @IsNumber() @Min(0)
  qtyReceived?: number;

  @IsOptional() @IsNumber() @Min(0)
  qtyInstalled?: number;

  // A line covering several units may carry one serial per unit, so the client
  // is free to send an array; it is flattened to the stored comma-separated form
  // before validation.
  @IsOptional() @Transform(({ value }) => joinSerials(value)) @IsString()
  serialNumbers?: string | string[];

  @IsOptional() @IsDateString()
  installDate?: string;

  @IsOptional() @IsEnum(MicItemStatus)
  status?: MicItemStatus;

  @IsOptional() @IsUUID()
  itemId?: string;
}

export class CreateMicDto {
  @IsOptional() @IsString()
  assignmentNo?: string;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString()
  siteId?: string;

  @IsOptional() @IsString()
  projectClient?: string;

  @IsOptional() @IsString()
  installDepartment?: string;

  @IsOptional() @IsUUID()
  verifiedById?: string;

  @IsOptional() @IsString()
  purposeDescription?: string;

  // Approval-only statuses are refused here — they are reached through
  // PATCH /mic/:id/review so the approver is taken from the token.
  @IsOptional() @IsEnum(MicStatus)
  status?: MicStatus;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MicItemDto)
  items?: MicItemDto[];
}

export class UpdateMicDto extends PartialType(CreateMicDto) {}

export class ReviewMicDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional() @IsString()
  rejectionReason?: string;
}
