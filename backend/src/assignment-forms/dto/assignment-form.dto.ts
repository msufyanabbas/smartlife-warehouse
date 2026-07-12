import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import {
  AssignmentFormPriority,
  AssignmentFormStatus,
} from '../entities/assignment-form.entity';
import { joinSerials } from '../../common/utils/serial-numbers';

export class AssignmentFormItemDto {
  @IsOptional() @IsString()
  itemCode?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  @IsOptional() @IsString()
  unit?: string;

  @IsOptional() @IsNumber() @Min(0)
  stockAvailable?: number;

  @IsOptional() @IsNumber() @Min(0)
  qtyRequested?: number;

  @IsOptional() @IsNumber() @Min(0)
  qtyApproved?: number;

  @IsOptional() @IsNumber() @Min(0)
  qtyIssued?: number;

  // A line covering several units may carry one serial per unit, so the client
  // is free to send an array; it is flattened to the stored comma-separated form
  // before validation.
  @IsOptional() @Transform(({ value }) => joinSerials(value)) @IsString()
  serialNumber?: string | string[];

  @IsOptional() @IsUUID()
  itemId?: string;
}

export class CreateAssignmentFormDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsEnum(AssignmentFormPriority)
  priority?: AssignmentFormPriority;

  @IsOptional() @IsUUID()
  requestedById?: string;

  @IsOptional() @IsString()
  department?: string;

  @IsOptional() @IsString()
  projectSite?: string;

  @IsOptional() @IsString()
  purposeDescription?: string;

  @IsOptional() @IsUUID()
  assignedToId?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsEnum(AssignmentFormStatus)
  status?: AssignmentFormStatus;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentFormItemDto)
  items?: AssignmentFormItemDto[];
}

export class UpdateAssignmentFormDto extends PartialType(CreateAssignmentFormDto) {}
