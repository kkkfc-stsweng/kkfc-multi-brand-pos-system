import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateBrandDTO {
  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name is required and cannot be empty.' })
  @MaxLength(150, { message: 'Name must be at most 150 characters long.' })
  @ApiProperty({ maxLength: 150 })
  name!: string;

  @IsString({ message: 'Code must be a string.' })
  @IsNotEmpty({ message: 'Code is required and cannot be empty.' })
  @MaxLength(4, { message: 'Code must be at most 4 characters long.' })
  @ApiProperty({
    minLength: 1,
    maxLength: 4,
    description:
      'Unique code supplied by the client; not generated from the name.',
  })
  code!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID('all', { message: 'Owner ID must be a valid UUID.' })
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for superadmins. Must identify an active OWNER without a brand. Owners may omit this field or provide their own user ID.',
  })
  owner_id?: string;

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
  })
  logo_url?: string | null;
}
