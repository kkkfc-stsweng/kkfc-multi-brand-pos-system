import {
  UsersDocs,
  CreateUserDocs,
  UpdateUserDocs,
  FindAllUsersDocs,
  FindOneUserDocs,
  DeleteUserDocs,
} from './docs/users.docs';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { FindUsersDTO } from './dto/find-users.dto';
import { Authenticated, type AuthenticatedRequest } from '../auth/auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';

@Controller('users')
@UsersDocs()
@UseGuards(Authenticated, RolesGuard)
@Roles(UserRole.OWNER, UserRole.SUPERADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @CreateUserDocs()
  async create(
    @Body() dto: CreateUserDTO,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.createUser(
      dto,
      request.session.user.role === UserRole.SUPERADMIN,
      request.session.user.brand_id,
    );
  }

  @Get()
  @FindAllUsersDocs()
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: FindUsersDTO,
  ) {
    const isSuperAdmin = request.session.user.role === UserRole.SUPERADMIN;

    return this.usersService.findAllUsers(
      query,
      request.session.user.brand_id,
      isSuperAdmin,
    );
  }

  @Get(':id')
  @FindOneUserDocs()
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id') usernameOrUserId: string,
    @Query('activeOnly', new DefaultValuePipe(true), ParseBoolPipe)
    activeOnly: boolean,
  ) {
    return this.usersService.findOneUser(
      usernameOrUserId,
      request.session.user.user_id,
      activeOnly,
      request.session.user.role === UserRole.SUPERADMIN,
    );
  }

  @Patch(':id')
  @UpdateUserDocs()
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDTO,
  ) {
    return this.usersService.updateUser(
      id,
      dto,
      request.session.user.user_id,
      request.session.user.role === UserRole.SUPERADMIN,
    );
  }

  @Delete(':id')
  @DeleteUserDocs()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.usersService.deleteUser(
      id,
      request.session.user.user_id,
      request.session.user.role === UserRole.SUPERADMIN,
    );
  }
}
