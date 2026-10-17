import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

export function AuthDocs() {
  return applyDecorators(
    ApiTags('Auth'),
    ApiResponse({ status: 400, description: 'Invalid request.' }),
  );
}

export function LoginDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Log in and create a 24-hour session.',
      description:
        'Available to active users of any role. Returns token, expires_at, and user. Use the token as Authorization: Bearer <token>. The user profile includes a nullable brand_id and excludes password_hash. The response uses Cache-Control: no-store.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Bearer token, expiration timestamp, and current user profile.',
    }),
    ApiResponse({
      status: 401,
      description: 'Invalid username or password, or inactive account.',
    }),
  );
}

export function MeDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get the current user profile.',
      description:
        'Available to any authenticated role. Returns the active user, including nullable brand_id, without password_hash. The response uses Cache-Control: no-store.',
    }),
    ApiResponse({
      status: 200,
      description: 'Current user profile with a single nullable brand_id.',
    }),
    ApiResponse({
      status: 401,
      description:
        'Bearer token missing, invalid, revoked, or expired; or the account is inactive.',
    }),
    ApiBearerAuth(),
  );
}

export function LogoutDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'End the current session.',
      description:
        'Requires a valid bearer token. Revokes only the current session; other sessions remain valid. Returns no response body.',
    }),
    ApiResponse({ status: 204, description: 'Session ended.' }),
    ApiResponse({
      status: 401,
      description:
        'Bearer token missing, invalid, revoked, or expired; or the account is inactive.',
    }),
    ApiBearerAuth(),
  );
}

export function LogoutAllDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'End all sessions for the current user.',
      description:
        'Requires a valid bearer token. Revokes every session for that user, including the current one. Returns no response body.',
    }),
    ApiResponse({
      status: 204,
      description: 'All sessions ended; no response body.',
    }),
    ApiResponse({
      status: 401,
      description:
        'Bearer token missing, invalid, revoked, or expired; or the account is inactive.',
    }),
    ApiBearerAuth(),
  );
}
