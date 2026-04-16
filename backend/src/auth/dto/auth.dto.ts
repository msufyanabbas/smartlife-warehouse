import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
