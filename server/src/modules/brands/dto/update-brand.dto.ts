import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateBrandDTO {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required and cannot be empty.' })
  @MaxLength(150, { message: 'Name must be at most 150 characters long.' })
  @ApiPropertyOptional({ maxLength: 150 })
  name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString({ message: 'Code must be a string.' })
  @IsNotEmpty({ message: 'Code is required and cannot be empty.' })
  @MaxLength(4, { message: 'Code must be at most 4 characters long.' })
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 4,
    description:
      'Unique client-supplied code. Omit to preserve the current code; changing the name does not change it.',
  })
  code?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Logo URL must be a valid URL.' })
  @MaxLength(2048, {
    message: 'Logo URL must be at most 2048 characters long.',
  })
  @ApiPropertyOptional({
    type: String,
    format: 'uri',
    maxLength: 2048,
    nullable: true,
    description: 'Omit to preserve the logo; null clears it.',
  })
  logo_url?: string | null;
}
