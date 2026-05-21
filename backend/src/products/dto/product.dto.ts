import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// Strips leading/trailing whitespace from string inputs; leaves non-strings untouched.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  name: string;

  @Transform(trim)
  @IsString()
  sku: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  brand?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  model?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  unit?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  notes?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  sku?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  brand?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  model?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  unit?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  notes?: string;

  @IsOptional()
  isActive?: boolean;
}
