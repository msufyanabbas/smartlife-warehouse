import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  assignedToId: string;

  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReturnAssignmentDto {
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
