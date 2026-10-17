import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

export function UsersDocs() {
  return applyDecorators(
    ApiTags('Users'),
    ApiResponse({ status: 400, description: 'Invalid request.' }),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Missing or expired session.' }),
    ApiResponse({ status: 403, description: 'Access denied.' }),
  );
}

export function CreateUserDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a user (owner or superadmin).',
      description:
        'Owners can create staff only in their assigned brand. Only superadmins can create OWNER or SUPERADMIN accounts. Staff require brand_id; owners and superadmins may omit it or use null. Any supplied brand must exist and be active. Responses omit password_hash.',
    }),
    ApiResponse({
      status: 201,
      description: 'Created user with nullable brand_id and no password hash.',
    }),
    ApiResponse({
      status: 404,
      description: 'The supplied brand does not exist or is inactive.',
    }),
    ApiResponse({
      status: 409,
      description:
        'Username is already taken, including by an inactive account.',
    }),
  );
}

export function UpdateUserDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update a user (owner or superadmin).',
      description:
        "Accepts a user ID, not a username. Owners can edit themselves or staff in their brand; they cannot edit another owner or superadmin, or change another user's password. Superadmins can edit active users across brands and reset passwords. Supports username, first_name, last_name, and password; role and brand_id cannot be changed here.",
    }),
    ApiParam({
      name: 'id',
      schema: { type: 'string', format: 'uuid' },
      description: 'User ID.',
    }),
    ApiResponse({
      status: 200,
      description: 'Updated user without password_hash.',
    }),
    ApiResponse({ status: 409, description: 'Username is already taken.' }),
    ApiResponse({ status: 404, description: 'User not found or inactive.' }),
  );
}

export function FindAllUsersDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'List users in your brand, or all users as a superadmin.',
      description:
        'Owners receive users in their assigned brand, or an empty list if unassigned. Superadmins receive users across all brands, including unassigned users. activeOnly defaults to true; false includes active and inactive users. Responses omit password_hash.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Paginated users in data, with page, limit, total, and totalPages in meta.',
    }),
  );
}

export function FindOneUserDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get a user by username or user ID (owner or superadmin).',
      description:
        'Owners can access themselves and users in their assigned brand. Superadmins can access users across brands. UUID-shaped identifiers are tried as user IDs before usernames. activeOnly defaults to true; false also permits inactive users. Responses omit password_hash.',
    }),
    ApiParam({
      name: 'id',
      schema: { type: 'string' },
      description: 'Username or user ID.',
    }),
    ApiResponse({
      status: 200,
      description: 'User with nullable brand_id and no password hash.',
    }),
    ApiQuery({
      name: 'activeOnly',
      required: false,
      type: Boolean,
      schema: { default: true },
      description:
        'When false, includes inactive users as well as active users.',
    }),
    ApiResponse({
      status: 404,
      description: 'User not found under the requested activeOnly filter.',
    }),
  );
}

export function DeleteUserDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Deactivate yourself, or any user as a superadmin.',
      description:
        'Accepts a user ID, not a username. Owners can deactivate only themselves. Superadmins can deactivate any active user. The record is preserved, and the user can no longer authenticate.',
    }),
    ApiParam({
      name: 'id',
      schema: { type: 'string', format: 'uuid' },
      description: 'User ID.',
    }),
    ApiResponse({
      status: 200,
      description: 'Deactivated user without password_hash.',
    }),
    ApiResponse({
      status: 404,
      description: 'User not found or already inactive.',
    }),
  );
}
