import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateBrandDTO } from './dto/create-brand.dto';
import { Prisma, UserRole } from '@prisma/client';
import { UpdateBrandDTO } from './dto/update-brand.dto';

@Injectable()
export class BrandsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createBrand(dto: CreateBrandDTO, ownerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: { name: dto.name, code: dto.code, logo_url: dto.logo_url },
      });

      const { count } = await tx.user.updateMany({
        where: {
          user_id: ownerId,
          role: UserRole.OWNER,
          brand_id: null,
          is_active: true,
        },
        data: {
          brand_id: brand.brand_id,
          modified_at: new Date(),
        },
      });

      if (count === 0) {
        throw new ConflictException({
          code: 'OWNER_CANNOT_CREATE_BRAND',
          message: 'The user must be an active owner with no existing brand.',
        });
      }

      return brand;
    });
  }

  async findOneBrand(
    brandId: string,
    activeOnly = true,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.brand.findUnique({
      where: {
        brand_id: brandId,
        is_active: activeOnly ? true : undefined,
      },
    });
  }

  async findOneBrandByCode(
    brandCode: string,
    activeOnly = true,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.brand.findUnique({
      where: {
        code: brandCode,
        is_active: activeOnly ? true : undefined,
      },
    });
  }

  async findAllBrands(
    skip: number,
    take: number,
    activeOnly = true,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const where: Prisma.BrandWhereInput = {
      is_active: activeOnly ? true : undefined,
    };

    const brandsQuery = tx.brand.findMany({
      where,
      skip,
      take,
      orderBy: [{ created_at: 'desc' }, { brand_id: 'asc' }],
    });
    const totalQuery = tx.brand.count({ where });

    const [brands, total] =
      '$transaction' in tx
        ? await tx.$transaction([brandsQuery, totalQuery], {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          })
        : await Promise.all([brandsQuery, totalQuery]);

    return { brands, total };
  }

  async updateBrand(
    brandId: string,
    dto: UpdateBrandDTO,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.brand.update({
      where: {
        brand_id: brandId,
        is_active: true,
      },
      data: {
        code: dto.code,
        name: dto.name,
        logo_url: dto.logo_url,
        modified_at: new Date(),
      },
    });
  }

  async deleteBrand(brandId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const deletedBrand = await tx.brand.update({
        where: {
          brand_id: brandId,
          is_active: true,
        },
        data: {
          is_active: false,
          modified_at: new Date(),
        },
      });

      await tx.user.updateMany({
        where: {
          brand_id: brandId,
          is_active: true,
        },
        data: {
          is_active: false,
          modified_at: new Date(),
        },
      });

      return deletedBrand;
    });
  }
}
