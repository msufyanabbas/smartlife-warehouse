import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';

export class CreateReturnRequestDto {
  @IsUUID()
  assignmentId: string;

  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewReturnRequestDto {
  @IsString()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}