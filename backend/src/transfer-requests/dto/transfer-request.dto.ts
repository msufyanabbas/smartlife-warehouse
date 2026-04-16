import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';

export class CreateTransferRequestDto {
  @IsUUID()
  toUserId: string;

  @IsUUID()
  itemId: string;

  @IsUUID()
  sourceAssignmentId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewTransferRequestDto {
  @IsString()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
