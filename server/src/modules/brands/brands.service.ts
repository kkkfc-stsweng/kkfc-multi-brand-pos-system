import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BrandsRepository } from './brands.repository';
import { CreateBrandDTO } from './dto/create-brand.dto';
import { assertExists } from '../../shared/assertions/assert-exists';
import { FindBrandsDTO } from './dto/find-brands.dto';
import { assertValidPagination } from '../../shared/assertions/assert-valid-pagination';
import { UpdateBrandDTO } from './dto/update-brand.dto';

@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name);
  constructor(private readonly brandsRepository: BrandsRepository) {}

  async create(dto: CreateBrandDTO, callerId: string, isSuperAdmin = false) {
    this.logger.log(`Creating new brand ${dto.name}`);

    if (
      !isSuperAdmin &&
      dto.owner_id !== undefined &&
      dto.owner_id !== callerId
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You can only create a brand for yourself.',
      });
    }

    const ownerId = isSuperAdmin ? dto.owner_id : callerId;
    if (ownerId == null) {
      throw new BadRequestException({
        code: 'MISSING_OWNER_ID',
        message: 'Owner ID is required when a superadmin creates a brand.',
      });
    }

    const brand = await this.brandsRepository.createBrand(dto, ownerId);

    this.logger.log(
      `Created new brand ${brand.name} with brand_id ${brand.brand_id}`,
    );

    return brand;
  }

  async findOne(brandId: string) {
    this.logger.debug(`Finding brand with brandId ${brandId}`);

    const brand = await this.brandsRepository.findOneBrand(brandId);

    assertExists(brand, 'Brand', brandId, this.logger);

    this.logger.log(`Brand with brandId ${brand.brand_id} found`);
    return brand;
  }

  async findAll({ page, limit, activeOnly }: FindBrandsDTO) {
    this.logger.log(
      `Listing brands: page=${page}, limit=${limit}, activeOnly=${activeOnly}`,
    );

    const skip = (page - 1) * limit;

    assertValidPagination(skip, this.logger);

    const { brands, total } = await this.brandsRepository.findAllBrands(
      skip,
      limit,
      activeOnly,
    );

    this.logger.log(
      `Listed brands: page=${page}, returned=${brands.length}, total=${total}`,
    );

    return {
      data: brands,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(brandId: string, dto: UpdateBrandDTO) {
    this.logger.log(`Updating brand ${brandId}`);

    const brand = await this.brandsRepository.findOneBrand(brandId);
    assertExists(brand, 'Brand', brandId, this.logger);

    const updatedBrand = await this.brandsRepository.updateBrand(brandId, dto);
    this.logger.log(`Updated brand ${updatedBrand.brand_id}`);

    return updatedBrand;
  }

  async delete(brandId: string) {
    this.logger.debug(`Deleting brand ${brandId}`);

    const brand = await this.brandsRepository.findOneBrand(brandId);
    assertExists(brand, 'Brand', brandId, this.logger);

    const deletedBrand = await this.brandsRepository.deleteBrand(
      brand.brand_id,
    );

    this.logger.log(`Deleted brand ${deletedBrand.brand_id}`);

    return deletedBrand;
  }
}
