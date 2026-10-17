import { Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { BrandsRepository } from '../brands.repository';
import { BrandsService } from '../brands.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

describe('BrandsService', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  const brand = {
    brand_id: 'brand-id',
    code: 'GC',
    name: 'Brand',
    logo_url: null,
    is_active: true,
    created_at: now,
    modified_at: now,
  };
  let brands: jest.Mocked<
    Pick<
      BrandsRepository,
      | 'createBrand'
      | 'findAllBrands'
      | 'findOneBrand'
      | 'updateBrand'
      | 'deleteBrand'
    >
  >;
  let service: BrandsService;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    brands = {
      createBrand: jest.fn<
        ReturnType<BrandsRepository['createBrand']>,
        Parameters<BrandsRepository['createBrand']>
      >((dto) => Promise.resolve({ ...brand, ...dto })),
      findAllBrands: jest
        .fn()
        .mockResolvedValue({ brands: [brand], total: 21 }),
      findOneBrand: jest.fn().mockResolvedValue(brand),
      updateBrand: jest.fn((_id, dto) => Promise.resolve({ ...brand, ...dto })),
      deleteBrand: jest.fn().mockResolvedValue({ ...brand, is_active: false }),
    };
    service = new BrandsService(brands as unknown as BrandsRepository);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('creation ownership', () => {
    const dto = { name: 'Brand', code: 'BRND' };

    it('requires superadmins to supply an owner ID', async () => {
      await expect(service.create(dto, 'admin', true)).rejects.toMatchObject({
        status: 400,
        response: { code: 'MISSING_OWNER_ID' },
      });
      expect(brands.createBrand).not.toHaveBeenCalled();
    });

    it('uses the selected owner for superadmin creation', async () => {
      const input = { ...dto, owner_id: 'selected-owner' };
      await service.create(input, 'admin', true);
      expect(brands.createBrand).toHaveBeenCalledWith(input, 'selected-owner');
    });

    it('blocks owners from selecting another owner', async () => {
      await expect(
        service.create({ ...dto, owner_id: 'another-owner' }, 'owner'),
      ).rejects.toMatchObject({ status: 403 });
      expect(brands.createBrand).not.toHaveBeenCalled();
    });

    it('accepts an owner explicitly selecting themselves', async () => {
      const input = { ...dto, owner_id: 'owner' };
      await service.create(input, 'owner');
      expect(brands.createBrand).toHaveBeenCalledWith(input, 'owner');
    });
  });

  describe('direct user-brand relation', () => {
    const tx = {
      brand: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      user: { updateMany: jest.fn() },
    };
    let repository: BrandsRepository;

    beforeEach(() => {
      for (const method of Object.values(tx.brand)) method.mockReset();
      tx.user.updateMany.mockReset().mockResolvedValue({ count: 1 });
      repository = new BrandsRepository({
        $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx),
      } as unknown as PrismaService);
    });

    it('sets the active owner brand without overwriting an existing brand', async () => {
      tx.brand.create.mockResolvedValue(brand);
      await repository.createBrand(
        { name: brand.name, code: brand.code, owner_id: 'owner' },
        'owner',
      );
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          user_id: 'owner',
          role: UserRole.OWNER,
          brand_id: null,
          is_active: true,
        },
        data: {
          brand_id: brand.brand_id,
          modified_at: expect.any(Date) as Date,
        },
      });
      expect(tx.brand.create).toHaveBeenCalledWith({
        data: { name: brand.name, code: brand.code, logo_url: undefined },
      });
    });

    it('rejects creation when the target is not an active owner without a brand', async () => {
      tx.brand.create.mockResolvedValue(brand);
      tx.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        repository.createBrand({ name: brand.name, code: brand.code }, 'owner'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it.each([true, false])(
      'lists all brands with matching totals and activeOnly=%s',
      async (activeOnly) => {
        tx.brand.findMany.mockResolvedValue([brand]);
        tx.brand.count.mockResolvedValue(1);
        await expect(
          repository.findAllBrands(
            0,
            10,
            activeOnly,
            tx as unknown as PrismaService,
          ),
        ).resolves.toEqual({ brands: [brand], total: 1 });
        const where = {
          is_active: activeOnly ? true : undefined,
        };
        expect(tx.brand.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where }),
        );
        expect(tx.brand.count).toHaveBeenCalledWith({ where });
      },
    );

    it('deactivates the brand and its active users together', async () => {
      tx.brand.update.mockResolvedValue({ ...brand, is_active: false });
      await repository.deleteBrand(brand.brand_id);
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { brand_id: brand.brand_id, is_active: true },
        data: { is_active: false, modified_at: expect.any(Date) as Date },
      });
    });

    it('propagates user deactivation failures so the transaction rolls back', async () => {
      tx.brand.update.mockResolvedValue({ ...brand, is_active: false });
      const error = new Error('User update failed');
      tx.user.updateMany.mockRejectedValue(error);
      await expect(repository.deleteBrand(brand.brand_id)).rejects.toBe(error);
    });

    it('queries only active brands by default', async () => {
      tx.brand.findUnique.mockResolvedValue(null);
      await expect(
        repository.findOneBrand(
          brand.brand_id,
          undefined,
          tx as unknown as PrismaService,
        ),
      ).resolves.toBeNull();
      expect(tx.brand.findUnique).toHaveBeenCalledWith({
        where: { brand_id: brand.brand_id, is_active: true },
      });
    });
  });

  it.each(['create', 'update'] as const)(
    'propagates a duplicate code during %s to the global conflict filter',
    async (operation) => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate code', {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['code'] },
      });
      (operation === 'create'
        ? brands.createBrand
        : brands.updateBrand
      ).mockRejectedValue(error);
      const result =
        operation === 'create'
          ? service.create({ name: 'Brand', code: 'TAKE' }, 'owner')
          : service.update(brand.brand_id, { code: 'TAKE' });
      await expect(result).rejects.toBe(error);
    },
  );
  it('creates a brand with the supplied code for its owner', async () => {
    const dto = { name: 'New Brand', code: 'USER' };

    await expect(service.create(dto, 'owner-id')).resolves.toMatchObject({
      name: dto.name,
      code: dto.code,
    });
    expect(brands.createBrand).toHaveBeenCalledWith(dto, 'owner-id');
  });

  it('returns an active brand and rejects a missing or inactive brand', async () => {
    await expect(service.findOne(brand.brand_id)).resolves.toEqual(brand);
    brands.findOneBrand.mockResolvedValue(null);
    await expect(service.findOne(brand.brand_id)).rejects.toMatchObject({
      status: 404,
      response: { code: 'BRAND_NOT_FOUND' },
    });
  });

  it.each([undefined, brand.name, 'Renamed'])(
    'preserves the code when only the name or logo changes: %s',
    async (name) => {
      const dto = { name, logo_url: 'https://example.com/logo.png' };

      await expect(service.update(brand.brand_id, dto)).resolves.toMatchObject({
        code: brand.code,
      });
      expect(brands.updateBrand).toHaveBeenCalledWith(brand.brand_id, dto);
    },
  );

  it('updates the code directly without requiring a name change', async () => {
    await expect(
      service.update(brand.brand_id, { code: 'EDIT' }),
    ).resolves.toMatchObject({ name: brand.name, code: 'EDIT' });
    expect(brands.updateBrand).toHaveBeenCalledWith(brand.brand_id, {
      code: 'EDIT',
    });
  });

  describe('updateBrand and deleteBrand', () => {
    it('UT-BRND-010: updates an existing brand using the supplied fields', async () => {
      const dto = { name: 'Updated', logo_url: null };
      await expect(service.update('brand-id', dto)).resolves.toEqual({
        ...brand,
        name: 'Updated',
      });
      expect(brands.findOneBrand).toHaveBeenCalledWith('brand-id');
      expect(brands.updateBrand).toHaveBeenCalledWith('brand-id', dto);
    });

    it('UT-BRND-011: uses the standard not-found error and propagates update/delete failures', async () => {
      brands.findOneBrand.mockResolvedValue(null);
      await expect(service.update('brand-id', {})).rejects.toMatchObject({
        status: 404,
        response: { code: 'BRAND_NOT_FOUND', message: 'Brand not found.' },
      });
      expect(brands.updateBrand).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Brand with id brand-id not found');

      brands.findOneBrand.mockResolvedValue(brand);
      const error = new Error('Database unavailable');
      brands.updateBrand.mockRejectedValue(error);
      await expect(service.update('brand-id', {})).rejects.toBe(error);
      expect(log).not.toHaveBeenCalledWith('Updated brand brand-id');
    });

    it.each(['update', 'delete'] as const)(
      'UT-BRND-012: propagates P2025 to the global filter when a brand disappears before %s',
      async (operation) => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'No matching brand',
          {
            code: 'P2025',
            clientVersion: '7.8.0',
          },
        );
        (operation === 'update'
          ? brands.updateBrand
          : brands.deleteBrand
        ).mockRejectedValue(error);
        const request =
          operation === 'update'
            ? service.update('brand-id', {})
            : service.delete('brand-id');
        await expect(request).rejects.toBe(error);
        expect(log).not.toHaveBeenCalledWith(
          `${operation === 'update' ? 'Updated' : 'Deleted'} brand brand-id`,
        );
      },
    );

    it('UT-BRND-013: deletes an existing brand and rejects missing brands', async () => {
      await expect(service.delete('brand-id')).resolves.toEqual({
        ...brand,
        is_active: false,
      });
      expect(brands.deleteBrand).toHaveBeenCalledWith('brand-id');

      brands.findOneBrand.mockResolvedValue(null);
      await expect(service.delete('brand-id')).rejects.toMatchObject({
        status: 404,
      });

      brands.findOneBrand.mockResolvedValue(brand);
      const error = new Error('Database unavailable');
      brands.deleteBrand.mockRejectedValue(error);
      await expect(service.delete('brand-id')).rejects.toBe(error);
    });
  });

  describe('findAllBrands', () => {
    it('rejects pagination offsets beyond the database range', async () => {
      await expect(
        service.findAll({ page: 2_147_483_647, limit: 2, activeOnly: true }),
      ).rejects.toMatchObject({ status: 400 });
      expect(brands.findAllBrands).not.toHaveBeenCalled();
    });

    it('returns zero pages for an empty listing', async () => {
      brands.findAllBrands.mockResolvedValue({ brands: [], total: 0 });
      await expect(
        service.findAll({ page: 1, limit: 10, activeOnly: true }),
      ).resolves.toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it.each([true, false])(
      'returns pagination metadata and forwards activeOnly=%s',
      async (activeOnly) => {
        await expect(
          service.findAll({
            page: 2,
            limit: 10,
            activeOnly,
          }),
        ).resolves.toEqual({
          data: [brand],
          meta: { page: 2, limit: 10, total: 21, totalPages: 3 },
        });
        expect(brands.findAllBrands).toHaveBeenCalledWith(10, 10, activeOnly);
      },
    );
  });
});
