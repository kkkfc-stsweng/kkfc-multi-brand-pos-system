import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { FindUsersDTO } from './dto/find-users.dto';
import { assertExists } from '../../shared/assertions/assert-exists';
import { assertValidPagination } from '../../shared/assertions/assert-valid-pagination';
import { isUUID } from 'class-validator';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) {}

  async createUser(
    dto: CreateUserDTO,
    isSuperAdmin = false,
    callerBrandId: string | null = null,
  ) {
    this.logger.log(`Creating ${dto.role} user ${dto.first_name}`);

    if (
      !isSuperAdmin &&
      (dto.role === UserRole.OWNER || dto.role === UserRole.SUPERADMIN)
    ) {
      throw new ForbiddenException({
        code: 'CANNOT_CREATE_PRIVILEGED_ACCOUNT',
        message: 'You are not authorized to create this role.',
      });
    }

    const existingUser = await this.usersRepository.safeFindByUsername(
      dto.username,
      false,
    );

    if (existingUser) {
      this.logger.warn(`Username ${dto.username} already exists.`);

      throw new ConflictException({
        code: 'USERNAME_ALREADY_EXISTS',
        message: 'Username already exists.',
      });
    }

    if (
      dto.brand_id == null &&
      dto.role !== UserRole.OWNER &&
      dto.role !== UserRole.SUPERADMIN
    ) {
      this.logger.warn(`Brand ID missing for role.`);

      throw new BadRequestException({
        code: 'MISSING_BRAND_ID',
        message: 'Brand ID is required for this role.',
      });
    }

    if (
      !isSuperAdmin &&
      (callerBrandId === null || callerBrandId !== dto.brand_id)
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You can only create users in your brand.',
      });
    }

    const user = await this.usersRepository.create(dto);

    this.logger.log(`
      Created new user with role: ${user.role} with user_id: ${user.user_id}
    `);

    return user;
  }

  async findAllUsers(
    { page, limit, activeOnly }: FindUsersDTO,
    callerBrandId: string | null,
    isSuperAdmin = false,
  ) {
    this.logger.log(
      `Listing users: page=${page}, limit=${limit}, activeOnly=${activeOnly}`,
    );

    const skip = (page - 1) * limit;
    assertValidPagination(skip, this.logger);

    const { users, total } = await this.usersRepository.findAll(
      skip,
      limit,
      callerBrandId,
      activeOnly,
      isSuperAdmin,
    );

    this.logger.log(
      `Listed users: page=${page}, returned=${users.length}, total=${total}`,
    );

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneUser(
    usernameOrUserId: string | { user_id: string },
    callerId: string,
    activeOnly = true,
    isSuperAdmin = false,
  ) {
    const identifier =
      typeof usernameOrUserId === 'string'
        ? usernameOrUserId
        : usernameOrUserId.user_id;
    this.logger.log(`Finding user ${identifier}`);

    let user =
      typeof usernameOrUserId === 'string' && !isUUID(identifier)
        ? await this.usersRepository.safeFindByUsername(identifier, activeOnly)
        : await this.usersRepository.findOne(identifier, activeOnly);

    if (!user && typeof usernameOrUserId === 'string' && isUUID(identifier)) {
      user = await this.usersRepository.safeFindByUsername(
        identifier,
        activeOnly,
      );
    }

    assertExists(user, 'User', identifier, this.logger);

    if (!isSuperAdmin && user.user_id !== callerId) {
      const caller = await this.usersRepository.findOne(callerId);
      assertExists(caller, 'User', callerId, this.logger);

      if (caller.brand_id === null || caller.brand_id !== user.brand_id) {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'You cannot access users outside your brand.',
        });
      }
    }

    this.logger.log(`User ${user.user_id} with role ${user.role} found.`);
    return user;
  }

  async updateUser(
    userId: string,
    dto: UpdateUserDTO,
    callerId: string,
    isSuperAdmin = false,
  ) {
    this.logger.log(`Updating user ${userId}`);

    const user = await this.findOneUser(
      { user_id: userId },
      callerId,
      true,
      isSuperAdmin,
    );

    if (
      !isSuperAdmin &&
      user.user_id !== callerId &&
      (user.role === UserRole.OWNER ||
        user.role === UserRole.SUPERADMIN ||
        dto.password !== undefined)
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message:
          "You cannot edit another owner or superadmin, or change another user's password.",
      });
    }

    if (dto.username !== undefined && dto.username !== user.username) {
      const existingUsername = await this.usersRepository.safeFindByUsername(
        dto.username,
        false,
      );

      if (existingUsername) {
        throw new ConflictException({
          code: 'USERNAME_ALREADY_EXISTS',
          message: 'Username already exists.',
        });
      }
    }

    try {
      const updated = await this.usersRepository.update(user.user_id, dto);
      this.logger.log(`Updated user ${userId}`);
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        });
      }

      throw error;
    }
  }

  async deleteUser(userId: string, callerId: string, isSuperAdmin = false) {
    this.logger.log(`Deactivating user ${userId}`);

    if (!isSuperAdmin && userId !== callerId) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You can only deactivate your own account.',
      });
    }

    const user = await this.findOneUser(
      { user_id: userId },
      callerId,
      true,
      isSuperAdmin,
    );

    assertExists(user, 'User', userId, this.logger);

    const deleted = await this.usersRepository.delete(user.user_id);
    this.logger.log(`Deactivated user ${userId}`);
    return deleted;
  }
}
