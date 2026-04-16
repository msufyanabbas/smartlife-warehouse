import { IsString, IsOptional, IsInt, Min, IsUUID, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateItemUsageDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  assignmentId: string;

  @IsInt()
  @Min(1)
  quantityUsed: number;

  @IsString()
  @IsNotEmpty()
  taskNo: string;

  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  usedAt?: string;
}