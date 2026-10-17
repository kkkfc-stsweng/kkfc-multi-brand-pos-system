import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { AuthModule } from '../auth.module';
import { AuthRepository } from '../auth.repository';
import { AuthService } from '../auth.service';
import { CreateSessionDTO } from '../dto/create-session.dto';
import { UsersRepository } from '../../users/users.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

describe('Auth HTTP endpoints', () => {
  let app: INestApplication;
  let url: string;
  let passwordHash: string;
  const owner = {
    user_id: randomUUID(),
    username: 'owner',
    first_name: 'Test',
    last_name: 'Owner',
    role: UserRole.OWNER,
    is_active: true,
    created_at: new Date(),
    modified_at: new Date(),
    brand_id: randomUUID() as string | null,
  };
  const staff = {
    ...owner,
    user_id: randomUUID(),
    username: 'staff',
    role: UserRole.KITCHEN_PREPARER,
  };
  const users = new Map<string, typeof owner | typeof staff>();
  type Session = CreateSessionDTO & {
    session_id: string;
    created_at: Date;
    last_seen_at: Date;
  };
  const sessions = new Map<string, Session>();
  const safeSession = (session: Session) => ({
    session_id: session.session_id,
    user_id: session.user_id,
    created_at: session.created_at,
    expires_at: session.expires_at,
    last_seen_at: session.last_seen_at,
  });

  beforeAll(async () => {
    passwordHash = await argon2.hash('correct-password');
    const matchingUsers = (where: {
      is_active?: boolean;
      brand_id?: string | null;
    }) =>
      [...users.values()].filter((user) => {
        return (
          (where.is_active === undefined ||
            user.is_active === where.is_active) &&
          (where.brand_id === undefined || user.brand_id === where.brand_id)
        );
      });
    const listingRepository = new UsersRepository({
      user: {
        findMany: ({
          where,
          skip,
          take,
        }: {
          where: { is_active?: boolean; brand_id?: string | null };
          skip: number;
          take: number;
        }) => Promise.resolve(matchingUsers(where).slice(skip, skip + take)),
        count: ({
          where,
        }: {
          where: { is_active?: boolean; brand_id?: string | null };
        }) => Promise.resolve(matchingUsers(where).length),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    } as unknown as PrismaService);
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UsersRepository)
      .useValue({
        findByUsername: jest.fn((username: string) => {
          const user = [...users.values()].find(
            (user) => user.username === username && user.is_active,
          );
          return Promise.resolve(
            user
              ? { user_id: user.user_id, password_hash: passwordHash }
              : null,
          );
        }),
        findOne: jest.fn((userId: string) => {
          const user = users.get(userId);
          return Promise.resolve(user?.is_active ? user : null);
        }),
        findAll: jest.fn(
          (
            skip: number,
            take: number,
            callerBrandId: string | null,
            activeOnly: boolean = true,
            isSuperAdmin = false,
          ) =>
            listingRepository.findAll(
              skip,
              take,
              callerBrandId,
              activeOnly,
              isSuperAdmin,
            ),
        ),
      })
      .overrideProvider(AuthRepository)
      .useValue({
        create: jest.fn((dto: CreateSessionDTO) => {
          const session = {
            ...dto,
            session_id: randomUUID(),
            created_at: new Date(),
            last_seen_at: new Date(),
          };
          sessions.set(session.session_id, session);
          return Promise.resolve(safeSession(session));
        }),
        findOneSessionByTokenHash: jest.fn((hash: string) => {
          const session = [...sessions.values()].find(
            (session) => session.token_hash === hash,
          );
          return Promise.resolve(session ? safeSession(session) : null);
        }),
        updateLastSeen: jest.fn((sessionId: string) => {
          const session = sessions.get(sessionId)!;
          session.last_seen_at = new Date();
          return Promise.resolve(safeSession(session));
        }),
        delete: jest.fn((sessionId: string) => {
          const session = sessions.get(sessionId)!;
          sessions.delete(sessionId);
          return Promise.resolve(safeSession(session));
        }),
        deleteMany: jest.fn((userId: string) => {
          let count = 0;
          for (const [id, session] of sessions) {
            if (session.user_id === userId) {
              sessions.delete(id);
              count++;
            }
          }
          return Promise.resolve({ count });
        }),
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
    url = await app.getUrl();
  });

  beforeEach(() => {
    sessions.clear();
    users.clear();
    users.set(owner.user_id, { ...owner });
    users.set(staff.user_id, { ...staff });
  });

  afterAll(async () => {
    await app?.close();
  });

  async function login(username = 'owner') {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'correct-password' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return (await response.json()) as {
      token: string;
      expires_at: string;
      user: ReturnType<AuthService['getUserProfile']>;
    };
  }

  it('IT-AUTH-014: hides unrelated users from listings and individual lookups', async () => {
    const unrelated = {
      ...staff,
      user_id: randomUUID(),
      username: 'unrelated',
      brand_id: randomUUID(),
    };
    users.set(unrelated.user_id, unrelated);
    const { token } = await login();
    const headers = { Authorization: `Bearer ${token}` };
    for (const suffix of ['', '?activeOnly=false']) {
      const response = await fetch(`${url}/api/users${suffix}`, { headers });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { user_id: string }[];
        meta: { total: number };
      };
      expect(body.data.map((user) => user.user_id).sort()).toEqual(
        [owner.user_id, staff.user_id].sort(),
      );
      expect(body.meta.total).toBe(2);
    }
    const lookup = await fetch(`${url}/api/users/${unrelated.user_id}`, {
      headers,
    });
    expect(lookup.status).toBe(403);
  });

  it('IT-AUTH-015: blocks edits to another owner, password resets, and global staff deactivation', async () => {
    const otherOwner = {
      ...owner,
      user_id: randomUUID(),
      username: 'other-owner',
    };
    users.set(otherOwner.user_id, otherOwner);
    const { token } = await login();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    const ownerUpdate = await fetch(`${url}/api/users/${otherOwner.user_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ first_name: 'Changed' }),
    });
    expect(ownerUpdate.status).toBe(403);
    const passwordReset = await fetch(`${url}/api/users/${staff.user_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ password: 'new-password' }),
    });
    expect(passwordReset.status).toBe(403);
    const deletion = await fetch(`${url}/api/users/${staff.user_id}`, {
      method: 'DELETE',
      headers,
    });
    expect(deletion.status).toBe(403);
  });

  it('IT-AUTH-001: issues a random token, persists its hash, and returns a safe profile', async () => {
    const body = await login();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      Math.abs(new Date(body.expires_at).getTime() - Date.now() - 86400000),
    ).toBeLessThan(5000);
    expect(body.user).toEqual({
      user_id: owner.user_id,
      username: 'owner',
      first_name: 'Test',
      last_name: 'Owner',
      role: UserRole.OWNER,
      brand_id: owner.brand_id,
      is_active: owner.is_active,
      created_at: owner.created_at.toISOString(),
      modified_at: owner.modified_at.toISOString(),
    });
    expect(body.user).not.toHaveProperty('password_hash');
    expect(body).not.toHaveProperty('token_hash');
    expect([...sessions.values()][0].token_hash).toBe(
      createHash('sha256').update(body.token).digest('hex'),
    );
  });

  it.each([
    { username: 'unknown', password: 'correct-password' },
    { username: 'owner', password: 'wrong-password' },
  ])(
    'IT-AUTH-002: rejects invalid credentials without creating a session',
    async (credentials) => {
      const response = await fetch(`${url}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      expect(sessions.size).toBe(0);
    },
  );

  it('IT-AUTH-003: rejects client-supplied session fields', async () => {
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'owner',
        password: 'correct-password',
        user_id: owner.user_id,
      }),
    });
    expect(response.status).toBe(400);
    expect(sessions.size).toBe(0);
  });

  it.each([undefined, 'Basic abc', 'Bearer', 'Bearer a b', 'Bearer unknown'])(
    'IT-AUTH-004: rejects missing or invalid bearer tokens: %s',
    async (authorization) => {
      const response = await fetch(`${url}/api/auth/me`, {
        headers: authorization ? { Authorization: authorization } : {},
      });
      expect(response.status).toBe(401);
    },
  );

  it('IT-AUTH-005: returns the authenticated user and accepts old activity timestamps', async () => {
    const { token, user } = await login();
    [...sessions.values()][0].last_seen_at = new Date(0);
    const response = await fetch(`${url}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(user);
  });

  it('IT-AUTH-006: returns a null brand when no brand is assigned', async () => {
    users.set(owner.user_id, { ...owner, brand_id: null });
    const { token, user } = await login();
    expect(user.brand_id).toBeNull();
    const response = await fetch(`${url}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
  });

  it('IT-AUTH-007: logout invalidates only the current session', async () => {
    const first = await login();
    const second = await login();
    const response = await fetch(`${url}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${first.token}` },
    });
    expect(response.status).toBe(204);
    expect(sessions.size).toBe(1);
    expect(
      (
        await fetch(`${url}/api/auth/me`, {
          headers: { Authorization: `Bearer ${first.token}` },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${url}/api/auth/me`, {
          headers: { Authorization: `Bearer ${second.token}` },
        })
      ).status,
    ).toBe(200);
  });

  it('IT-AUTH-008: logout-all leaves another user’s sessions intact', async () => {
    const first = await login();
    await login();
    const other = await login('staff');
    expect(
      (
        await fetch(`${url}/api/auth/logout-all`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${first.token}` },
        })
      ).status,
    ).toBe(204);
    expect(sessions.size).toBe(1);
    expect(
      (
        await fetch(`${url}/api/auth/me`, {
          headers: { Authorization: `Bearer ${other.token}` },
        })
      ).status,
    ).toBe(200);
  });

  it('IT-AUTH-009: rejects expired sessions', async () => {
    const { token } = await login();
    [...sessions.values()][0].expires_at = new Date(0);
    expect(
      (
        await fetch(`${url}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(401);
  });

  it('IT-AUTH-010: rejects sessions after account deactivation', async () => {
    const { token } = await login();
    users.get(owner.user_id)!.is_active = false;
    expect(
      (
        await fetch(`${url}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(401);
    const response = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'correct-password' }),
    });
    expect(response.status).toBe(401);
  });

  it.each([
    { query: '', total: 2, inactiveReturned: false },
    { query: '&activeOnly=true', total: 2, inactiveReturned: false },
    { query: '&activeOnly=false', total: 3, inactiveReturned: true },
  ])(
    'IT-AUTH-011: paginates users with the active-only filter: $query',
    async ({ query, total, inactiveReturned }) => {
      const inactive = {
        ...staff,
        user_id: randomUUID(),
        username: 'inactive',
        is_active: false,
      };
      users.set(inactive.user_id, inactive);
      const { token } = await login();

      const response = await fetch(`${url}/api/users?page=2&limit=2${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: inactiveReturned
          ? [
              expect.objectContaining({
                user_id: inactive.user_id,
                is_active: false,
              }),
            ]
          : [],
        meta: {
          page: 2,
          limit: 2,
          total,
          totalPages: inactiveReturned ? 2 : 1,
        },
      });
    },
  );

  it.each(['', 'yes', '1', '0', 'FALSE', 'false&activeOnly=true'])(
    'IT-AUTH-012: rejects invalid activeOnly query values: %s',
    async (value) => {
      const { token } = await login();

      const response = await fetch(`${url}/api/users?activeOnly=${value}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(400);
    },
  );

  it('IT-AUTH-013: requires owner access for user management', async () => {
    expect((await fetch(`${url}/api/users`)).status).toBe(401);
    const member = await login('staff');
    expect(
      (
        await fetch(`${url}/api/users`, {
          headers: { Authorization: `Bearer ${member.token}` },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${url}/api/users`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${member.token}` },
        })
      ).status,
    ).toBe(403);
    const admin = await login();
    expect(
      (
        await fetch(`${url}/api/users`, {
          headers: { Authorization: `Bearer ${admin.token}` },
        })
      ).status,
    ).toBe(200);
  });
});
