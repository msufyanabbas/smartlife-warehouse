import { IsString, IsOptional, IsInt, Min, IsUUID, IsNotEmpty } from 'class-validator';

export class CreateItemRequestDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewItemRequestDto {
  @IsString()
  @IsNotEmpty()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}