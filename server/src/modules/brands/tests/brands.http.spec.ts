import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { BrandsModule } from '../brands.module';
import { BrandsService } from '../brands.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Authenticated } from '../../auth/auth.guard';

describe('Brands HTTP endpoints', () => {
  let app: INestApplication;
  let url: string;
  let currentRole: UserRole;
  let currentBrandId: string | null;
  const brandId = '00000000-0000-4000-8000-000000000001';
  const ownerId = '00000000-0000-4000-8000-000000000004';
  const otherBrandId = '00000000-0000-4000-8000-000000000099';
  const service = {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [BrandsModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(BrandsService)
      .useValue(service)
      .overrideGuard(Authenticated)
      .useValue({
        canActivate(context: ExecutionContext) {
          const request = context.switchToHttp().getRequest<{
            session: {
              user: {
                user_id: string;
                role: UserRole;
                brand_id: string | null;
              };
            };
          }>();
          request.session = {
            user: {
              user_id: ownerId,
              role: currentRole,
              brand_id: currentBrandId,
            },
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    url = (await app.getUrl()) + '/api/brands';
  });

  beforeEach(() => {
    currentRole = UserRole.OWNER;
    currentBrandId = brandId;
    for (const method of Object.values(service))
      method.mockReset().mockResolvedValue({ ok: true });
  });
  afterAll(async () => app?.close());

  it.each([
    ['', { page: 1, limit: 10, activeOnly: true }],
    [
      '?page=2&limit=5&activeOnly=false',
      { page: 2, limit: 5, activeOnly: false },
    ],
  ] as const)('lists brands with pagination: %s', async (query, expected) => {
    currentRole = UserRole.SUPERADMIN;
    currentBrandId = null;
    expect((await fetch(url + query)).status).toBe(200);
    expect(service.findAll).toHaveBeenCalledWith(expected);
  });

  it.each(['GET', 'DELETE'])(
    'delegates %s for the owner brand',
    async (method) => {
      expect((await fetch(url + '/' + brandId, { method })).status).toBe(200);
      expect(
        method === 'GET' ? service.findOne : service.delete,
      ).toHaveBeenCalledWith(brandId);
    },
  );

  it('validates and forwards brand updates', async () => {
    const dto = { name: 'Updated', code: 'EDIT', logo_url: null };
    const response = await fetch(url + '/' + brandId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    expect(response.status).toBe(200);
    expect(service.update).toHaveBeenCalledWith(brandId, dto);
  });

  it.each(
    Object.values(UserRole).filter((role) => role !== UserRole.SUPERADMIN),
  )('allows %s to read their brand', async (role) => {
    currentRole = role;
    expect((await fetch(url + '/' + brandId)).status).toBe(200);
    expect(service.findOne).toHaveBeenCalledWith(brandId);
  });

  it.each(['GET', 'PATCH', 'DELETE'])(
    'allows superadmins to access another brand: %s',
    async (method) => {
      currentRole = UserRole.SUPERADMIN;
      currentBrandId = null;
      expect((await fetch(url + '/' + otherBrandId, { method })).status).toBe(
        200,
      );
    },
  );

  it.each(['GET', 'PATCH', 'DELETE'])(
    'blocks owners from another brand: %s',
    async (method) => {
      expect((await fetch(url + '/' + otherBrandId, { method })).status).toBe(
        403,
      );
      for (const handler of Object.values(service))
        expect(handler).not.toHaveBeenCalled();
    },
  );

  it('blocks users without a brand', async () => {
    currentBrandId = null;
    expect((await fetch(url + '/' + brandId)).status).toBe(403);
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it.each(['PATCH', 'DELETE'])(
    'keeps %s owner-only for assigned staff',
    async (method) => {
      currentRole = UserRole.ORDER_STAFF;
      expect((await fetch(url + '/' + brandId, { method })).status).toBe(403);
      for (const handler of Object.values(service))
        expect(handler).not.toHaveBeenCalled();
    },
  );

  it('rejects conflicting brand IDs', async () => {
    const response = await fetch(url + '/' + brandId, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_id: otherBrandId }),
    });
    expect(response.status).toBe(400);
    expect(service.delete).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'King Kungs Kafé', code: 'KKFC', logo_url: null },
    { name: 'King Kungs Kafé', code: 'KK' },
  ])('creates a brand for the authenticated owner: %j', async (dto) => {
    currentBrandId = null;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(dto, ownerId, false);
  });

  it.each([
    {},
    { code: 'BRND' },
    { name: '', code: 'BRND' },
    { name: 123, code: 'BRND' },
    { name: 'a'.repeat(151), code: 'BRND' },
    { name: 'Brand' },
    { name: 'Brand', code: '' },
    { name: 'Brand', code: null },
    { name: 'Brand', code: 123 },
    { name: 'Brand', code: 'ABCDE' },
    { name: 'Brand', code: 'BRND', logo_url: 'invalid' },
    { name: 'Brand', code: 'BRND', owner_id: 'another-owner' },
    { name: 'Brand', code: 'BRND', owner_id: null },
    { name: 'Brand', code: 'BRND', is_active: false },
  ])('rejects invalid creation bodies: %j', async (body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes the selected owner and authenticated superadmin flag on creation', async () => {
    currentRole = UserRole.SUPERADMIN;
    currentBrandId = null;
    const dto = { name: 'Brand', code: 'BRND', owner_id: ownerId };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(dto, ownerId, true);
  });

  it.each(
    Object.values(UserRole).filter((role) => role !== UserRole.SUPERADMIN),
  )('keeps the all-brands listing restricted from %s', async (role) => {
    currentRole = role;
    expect((await fetch(url)).status).toBe(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it.each(
    Object.values(UserRole).filter(
      (role) => role !== UserRole.OWNER && role !== UserRole.SUPERADMIN,
    ),
  )('rejects brand creation for %s', async (role) => {
    currentRole = role;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Brand', code: 'BRND' }),
    });
    expect(response.status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([
    { name: '', is_active: true },
    { code: '' },
    { code: null },
    { code: 123 },
    { code: 'ABCDE' },
    { owner_id: ownerId },
  ])('rejects invalid update bodies: %j', async (body) => {
    const response = await fetch(url + '/' + brandId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it.each(['GET', 'PATCH', 'DELETE'])(
    'rejects malformed brand IDs: %s',
    async (method) => {
      expect((await fetch(url + '/not-a-uuid', { method })).status).toBe(400);
      for (const handler of Object.values(service))
        expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each(['?page=0', '?limit=0', '?limit=101', '?activeOnly=invalid'])(
    'rejects invalid list filters: %s',
    async (query) => {
      currentRole = UserRole.SUPERADMIN;
      expect((await fetch(url + query)).status).toBe(400);
      expect(service.findAll).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['POST', '/assign'],
    ['GET', '/' + brandId + '/users'],
    ['GET', '/assignments/users/' + ownerId],
    ['GET', '/' + brandId + '/assignments/' + ownerId],
    ['DELETE', '/' + brandId + '/assignments/' + ownerId],
    ['PATCH', '/' + brandId + '/assignments/' + ownerId + '/reactivate'],
  ])('removes assignment routes: %s %s', async (method, path) => {
    expect((await fetch(url + path, { method })).status).toBe(404);
    for (const handler of Object.values(service))
      expect(handler).not.toHaveBeenCalled();
  });
});
