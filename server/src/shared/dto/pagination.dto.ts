import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaginationDTO {
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer.' })
  @Min(1, { message: 'Page must be at least 1.' })
  @Max(2_147_483_647, { message: 'Page must be at most 2_147_483_647.' })
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 2147483647,
    description:
      'Page number, starting at 1. The calculated offset must also fit a signed 32-bit integer.',
  })
  page: number = 1;

  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer.' })
  @Min(1, { message: 'Limit must be at least 1.' })
  @Max(100, { message: 'Limit must be at most 100.' })
  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
    description: 'Maximum number of records per page.',
  })
  limit: number = 10;
}
