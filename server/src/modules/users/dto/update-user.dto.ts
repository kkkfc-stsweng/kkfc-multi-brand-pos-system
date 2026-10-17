import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDTO {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'Username must be a string.' })
  @IsNotEmpty({ message: 'Username is required and cannot be empty.' })
  @MaxLength(64, { message: 'Username must be at most 64 characters long.' })
  @ApiPropertyOptional({ maxLength: 64 })
  username?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'First name must be a string.' })
  @IsNotEmpty({ message: 'First name is required and cannot be empty.' })
  @MaxLength(100, {
    message: 'First name must be at most 100 characters long.',
  })
  @ApiPropertyOptional({ maxLength: 100 })
  first_name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'Last name must be a string.' })
  @IsNotEmpty({ message: 'Last name is required and cannot be empty.' })
  @MaxLength(100, { message: 'Last name must be at most 100 characters long.' })
  @ApiPropertyOptional({ maxLength: 100 })
  last_name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'Password must be a string.' })
  @IsNotEmpty({ message: 'Password is required and cannot be empty.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(32, { message: 'Password must be at most 32 characters long.' })
  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 32,
    format: 'password',
    description:
      "Owners may change only their own password. Superadmins may reset another active user's password.",
  })
  password?: string;
}
