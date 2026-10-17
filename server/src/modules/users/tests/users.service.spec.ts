import { Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { CreateUserDTO } from '../dto/create-user.dto';
import { FindUsersDTO } from '../dto/find-users.dto';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

describe('UsersService', () => {
  const user = {
    user_id: '00000000-0000-4000-8000-000000000001',
    username: 'owner',
    first_name: 'Test',
    last_name: 'Owner',
    role: UserRole.OWNER,
    is_active: true,
    created_at: new Date('2030-01-01T00:00:00Z'),
    modified_at: new Date('2030-01-01T00:00:00Z'),
    brand_id: null,
  };
  const createDTO: CreateUserDTO = {
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    password: 'test-password',
  };
  let repository: jest.Mocked<
    Pick<
      UsersRepository,
      | 'create'
      | 'findAll'
      | 'findOne'
      | 'findByUsername'
      | 'safeFindByUsername'
      | 'update'
      | 'delete'
    >
  >;
  let service: UsersService;
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    repository = {
      create: jest.fn().mockResolvedValue(user),
      findAll: jest.fn().mockResolvedValue({ users: [user], total: 21 }),
      findOne: jest.fn().mockResolvedValue(user),
      findByUsername: jest.fn().mockResolvedValue(null),
      safeFindByUsername: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ ...user, first_name: 'Updated' }),
      delete: jest.fn().mockResolvedValue({ ...user, is_active: false }),
    };
    service = new UsersService(repository as unknown as UsersRepository);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('creation permissions', () => {
    it.each([UserRole.OWNER, UserRole.SUPERADMIN])(
      'allows superadmins to create %s accounts without a brand',
      async (role) => {
        const dto = { ...createDTO, role };
        await service.createUser(dto, true);
        expect(repository.create).toHaveBeenCalledWith(dto);
      },
    );

    it.each([UserRole.OWNER, UserRole.SUPERADMIN])(
      'blocks owners from creating %s accounts',
      async (role) => {
        await expect(
          service.createUser({ ...createDTO, role }, false, 'brand'),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, null])(
      'requires a staff brand even for superadmins: %s',
      async (brand_id) => {
        await expect(
          service.createUser(
            { ...createDTO, role: UserRole.ORDER_STAFF, brand_id },
            true,
          ),
        ).rejects.toMatchObject({ status: 400 });
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it.each(['other-brand', null])(
      'blocks owners with a different or missing caller brand: %s',
      async (callerBrandId) => {
        await expect(
          service.createUser(
            { ...createDTO, role: UserRole.ORDER_STAFF, brand_id: 'brand' },
            false,
            callerBrandId,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.create).not.toHaveBeenCalled();
      },
    );

    it('allows owners to create staff in their own brand', async () => {
      const dto = {
        ...createDTO,
        role: UserRole.ORDER_STAFF,
        brand_id: 'brand',
      };
      await service.createUser(dto, false, 'brand');
      expect(repository.create).toHaveBeenCalledWith(dto);
    });

    it('allows superadmins to create staff in another brand', async () => {
      const dto = {
        ...createDTO,
        role: UserRole.ORDER_STAFF,
        brand_id: 'brand',
      };
      await service.createUser(dto, true);
      expect(repository.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('superadmin bypasses', () => {
    it('forwards activeOnly and unrestricted listing separately', async () => {
      await service.findAllUsers(
        { page: 1, limit: 10, activeOnly: false },
        null,
        true,
      );
      expect(repository.findAll).toHaveBeenCalledWith(0, 10, null, false, true);
    });

    it('allows editing another owner and resetting their password', async () => {
      const dto = { password: 'new-password' };
      await service.updateUser(user.user_id, dto, 'superadmin', true);
      expect(repository.update).toHaveBeenCalledWith(user.user_id, dto);
    });

    it('allows deactivating another user', async () => {
      await service.deleteUser(user.user_id, 'superadmin', true);
      expect(repository.delete).toHaveBeenCalledWith(user.user_id);
    });
  });

  describe('brand access', () => {
    const caller = {
      ...user,
      brand_id: 'shared-brand',
    };
    const staff = {
      ...user,
      user_id: '00000000-0000-4000-8000-000000000002',
      role: UserRole.ORDER_STAFF,
      brand_id: 'shared-brand',
    };

    beforeEach(() => {
      repository.findOne.mockImplementation((id) =>
        Promise.resolve(id === caller.user_id ? caller : staff),
      );
    });

    it('returns another user in the same brand', async () => {
      await expect(
        service.findOneUser(staff.user_id, caller.user_id),
      ).resolves.toEqual(staff);
    });

    it('allows profile edits for staff in a shared brand', async () => {
      const dto = { username: 'renamed_staff', first_name: 'Updated' };
      await service.updateUser(staff.user_id, dto, caller.user_id);
      expect(repository.update).toHaveBeenCalledWith(staff.user_id, dto);
    });

    it.each([true, false])(
      'denies unrelated users even with activeOnly=%s',
      async (activeOnly) => {
        repository.findOne.mockImplementation((id) =>
          Promise.resolve(
            id === caller.user_id
              ? caller
              : {
                  ...staff,
                  brand_id: 'other-brand',
                },
          ),
        );
        await expect(
          service.findOneUser(staff.user_id, caller.user_id, activeOnly),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
          service.updateUser(
            staff.user_id,
            { first_name: 'Updated' },
            caller.user_id,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it.each([UserRole.OWNER, UserRole.SUPERADMIN])(
      'denies owner edits to another %s even in a shared brand',
      async (role) => {
        repository.findOne.mockImplementation((id) =>
          Promise.resolve(id === caller.user_id ? caller : { ...staff, role }),
        );
        await expect(
          service.updateUser(
            staff.user_id,
            { first_name: 'Updated' },
            caller.user_id,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it('denies password resets for shared staff without partially updating their profile', async () => {
      await expect(
        service.updateUser(
          staff.user_id,
          {
            first_name: 'Updated',
            password: 'new-password',
          },
          caller.user_id,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('allows changing your own password', async () => {
      const dto = { password: 'new-password' };
      await service.updateUser(caller.user_id, dto, caller.user_id);
      expect(repository.update).toHaveBeenCalledWith(caller.user_id, dto);
    });

    it('denies global deactivation of another user', async () => {
      await expect(
        service.deleteUser(staff.user_id, caller.user_id),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  it('UT-USER-001: creates a user with the supplied fields', async () => {
    await expect(service.createUser(createDTO, true)).resolves.toEqual(user);
    expect(repository.create).toHaveBeenCalledWith(createDTO);
  });

  it('UT-USER-002: returns a conflict when the username is already taken', async () => {
    repository.safeFindByUsername.mockResolvedValue(user);

    await expect(service.createUser(createDTO, true)).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'USERNAME_ALREADY_EXISTS',
        message: 'Username already exists.',
      },
    });
    expect(repository.safeFindByUsername).toHaveBeenCalledWith(
      user.username,
      false,
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining('Created new user'),
    );
  });

  it.each(['P1001', 'P2002', 'P2003'])(
    'UT-USER-003: propagates create failures to the global filter: %s',
    async (code) => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Database request failed',
        {
          code,
          clientVersion: '7.8.0',
        },
      );
      repository.create.mockRejectedValue(error);

      await expect(service.createUser(createDTO, true)).rejects.toBe(error);
    },
  );

  it.each([true, false])(
    'UT-USER-004: returns pagination metadata and forwards activeOnly=%s',
    async (activeOnly) => {
      await expect(
        service.findAllUsers({ page: 3, limit: 10, activeOnly }, 'brand-id'),
      ).resolves.toEqual({
        data: [user],
        meta: { page: 3, limit: 10, total: 21, totalPages: 3 },
      });
      expect(repository.findAll).toHaveBeenCalledWith(
        20,
        10,
        'brand-id',
        activeOnly,
        false,
      );
    },
  );

  it('UT-USER-005: returns an empty list and zero pages when no users match', async () => {
    repository.findAll.mockResolvedValue({ users: [], total: 0 });

    await expect(
      service.findAllUsers(new FindUsersDTO(), 'brand-id'),
    ).resolves.toEqual({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
    expect(repository.findAll).toHaveBeenCalledWith(
      0,
      10,
      'brand-id',
      true,
      false,
    );
  });

  it('UT-USER-006: returns an empty page past the last result while preserving totals', async () => {
    repository.findAll.mockResolvedValue({ users: [], total: 21 });

    await expect(
      service.findAllUsers(
        { page: 4, limit: 10, activeOnly: true },
        user.user_id,
      ),
    ).resolves.toEqual({
      data: [],
      meta: { page: 4, limit: 10, total: 21, totalPages: 3 },
    });
  });

  it('UT-USER-007: rejects offsets outside the database range before querying', async () => {
    await expect(
      service.findAllUsers(
        {
          page: 2_147_483_647,
          limit: 2,
          activeOnly: true,
        },
        user.user_id,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'PAGINATION_UNSUPPORTED_RANGE',
        message: 'Requested page exceeds the supported range.',
      },
    });
    expect(repository.findAll).not.toHaveBeenCalled();
  });

  it('UT-USER-008: allows the largest page number when its offset fits the database range', async () => {
    await service.findAllUsers(
      {
        page: 2_147_483_647,
        limit: 1,
        activeOnly: true,
      },
      user.user_id,
    );

    expect(repository.findAll).toHaveBeenCalledWith(
      2_147_483_646,
      1,
      user.user_id,
      true,
      false,
    );
  });

  it('UT-USER-009: returns an existing user', async () => {
    await expect(
      service.findOneUser(user.user_id, user.user_id),
    ).resolves.toEqual(user);
    expect(repository.findOne).toHaveBeenCalledWith(user.user_id, true);
  });

  it('UT-USER-010: allows explicitly finding an inactive user', async () => {
    const inactiveUser = { ...user, is_active: false };
    repository.findOne.mockResolvedValue(inactiveUser);

    await expect(
      service.findOneUser(user.user_id, user.user_id, false),
    ).resolves.toEqual(inactiveUser);
    expect(repository.findOne).toHaveBeenCalledWith(user.user_id, false);
  });

  it('UT-USER-011: updates an existing user with the supplied fields', async () => {
    const dto = { first_name: 'Updated' };

    await expect(
      service.updateUser(user.user_id, dto, user.user_id),
    ).resolves.toEqual({
      ...user,
      first_name: 'Updated',
    });
    expect(repository.findOne).toHaveBeenCalledWith(user.user_id, true);
    expect(repository.update).toHaveBeenCalledWith(user.user_id, dto);
  });

  describe('username updates', () => {
    it('updates to an available username and checks inactive accounts too', async () => {
      const dto = { username: 'renamed_owner' };
      repository.update.mockResolvedValue({ ...user, ...dto });

      await expect(
        service.updateUser(user.user_id, dto, user.user_id),
      ).resolves.toMatchObject(dto);
      expect(repository.safeFindByUsername).toHaveBeenCalledWith(
        dto.username,
        false,
      );
      expect(repository.update).toHaveBeenCalledWith(user.user_id, dto);
    });

    it.each([true, false])(
      'rejects a username belonging to another account with is_active=%s',
      async (is_active) => {
        repository.safeFindByUsername.mockResolvedValue({
          ...user,
          user_id: 'other-user-id',
          username: 'taken_username',
          is_active,
        });

        await expect(
          service.updateUser(
            user.user_id,
            { username: 'taken_username', first_name: 'Changed' },
            user.user_id,
          ),
        ).rejects.toMatchObject({
          status: 409,
          response: {
            code: 'USERNAME_ALREADY_EXISTS',
            message: 'Username already exists.',
          },
        });
        expect(repository.safeFindByUsername).toHaveBeenCalledWith(
          'taken_username',
          false,
        );
        expect(repository.update).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, user.username])(
      'skips the availability check for an omitted or unchanged username: %s',
      async (username) => {
        const dto = { username, first_name: 'Updated' };

        await service.updateUser(user.user_id, dto, user.user_id);

        expect(repository.safeFindByUsername).not.toHaveBeenCalled();
        expect(repository.update).toHaveBeenCalledWith(user.user_id, dto);
      },
    );

    it('does not write if the availability lookup fails', async () => {
      const error = new Error('Database unavailable');
      repository.safeFindByUsername.mockRejectedValue(error);

      await expect(
        service.updateUser(
          user.user_id,
          { username: 'renamed_owner' },
          user.user_id,
        ),
      ).rejects.toBe(error);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('propagates a concurrent username conflict to the global filter', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Username is already taken',
        { code: 'P2002', clientVersion: '7.8.0' },
      );
      repository.update.mockRejectedValue(error);

      await expect(
        service.updateUser(
          user.user_id,
          { username: 'renamed_owner' },
          user.user_id,
        ),
      ).rejects.toBe(error);
    });
  });

  it('UT-USER-012: rejects an update if the user is deactivated after the lookup', async () => {
    repository.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('No matching user', {
        code: 'P2025',
        clientVersion: '7.8.0',
      }),
    );

    await expect(
      service.updateUser(user.user_id, { first_name: 'Updated' }, user.user_id),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'USER_NOT_FOUND', message: 'User not found.' },
    });
    expect(repository.update).toHaveBeenCalledWith(user.user_id, {
      first_name: 'Updated',
    });
    expect(log).not.toHaveBeenCalledWith(`Updated user ${user.user_id}`);
  });

  it('UT-USER-013: propagates unrelated Prisma update failures', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Database unavailable',
      {
        code: 'P1001',
        clientVersion: '7.8.0',
      },
    );
    repository.update.mockRejectedValue(error);

    await expect(
      service.updateUser(user.user_id, { first_name: 'Updated' }, user.user_id),
    ).rejects.toBe(error);
  });

  it('UT-USER-014: deactivates an existing user', async () => {
    await expect(
      service.deleteUser(user.user_id, user.user_id),
    ).resolves.toEqual({
      ...user,
      is_active: false,
    });
    expect(repository.findOne).toHaveBeenCalledWith(user.user_id, true);
    expect(repository.delete).toHaveBeenCalledWith(user.user_id);
  });

  it.each([
    ['finding', () => service.findOneUser(user.user_id, user.user_id)],
    [
      'updating',
      () =>
        service.updateUser(
          user.user_id,
          { first_name: 'Updated' },
          user.user_id,
        ),
    ],
    ['deactivating', () => service.deleteUser(user.user_id, user.user_id)],
  ] as const)(
    'UT-USER-015: rejects %s a missing user without writing',
    async (_action, run) => {
      repository.findOne.mockResolvedValue(null);

      await expect(run()).rejects.toMatchObject({
        status: 404,
        response: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['create', () => service.createUser(createDTO, true)],
    ['findAll', () => service.findAllUsers(new FindUsersDTO(), user.user_id)],
    ['findOne', () => service.findOneUser(user.user_id, user.user_id)],
    [
      'update',
      () =>
        service.updateUser(
          user.user_id,
          { first_name: 'Updated' },
          user.user_id,
        ),
    ],
    ['delete', () => service.deleteUser(user.user_id, user.user_id)],
  ] as const)(
    'UT-USER-016: propagates repository failures from %s',
    async (method, run) => {
      const error = new Error('Database unavailable');
      repository[method].mockRejectedValue(error);

      await expect(run()).rejects.toBe(error);
    },
  );
});
