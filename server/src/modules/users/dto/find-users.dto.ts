import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';
import { PaginationDTO } from '../../../shared/dto/pagination.dto';

export class FindUsersDTO extends PaginationDTO {
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'activeOnly must be true or false.' })
  @ApiPropertyOptional({
    default: true,
    description:
      'True returns only active users; false includes active and inactive users. Brand access restrictions still apply.',
  })
  activeOnly: boolean = true;
}
