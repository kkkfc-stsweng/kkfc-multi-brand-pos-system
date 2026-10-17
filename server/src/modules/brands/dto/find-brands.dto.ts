import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { PaginationDTO } from '../../../shared/dto/pagination.dto';

export class FindBrandsDTO extends PaginationDTO {
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'activeOnly must be true or false.' })
  @ApiPropertyOptional({
    default: true,
    description:
      'True returns only active brands; false includes active and inactive brands. Listing is superadmin-only.',
  })
  activeOnly: boolean = true;
}
