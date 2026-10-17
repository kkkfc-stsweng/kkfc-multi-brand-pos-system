import { applyDecorators } from '@nestjs/common';
import {
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

export function BrandsDocs() {
  return applyDecorators(
    ApiTags('Brands'),
    ApiResponse({ status: 400, description: 'Invalid request.' }),
    ApiBearerAuth(),
    ApiResponse({ status: 401, description: 'Missing or expired session.' }),
    ApiResponse({ status: 403, description: 'Access denied.' }),
  );
}

export function CreateBrandDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a brand (owner or superadmin).',
      description:
        'Provide a unique code of one to four characters; the server does not generate it. Owners create brands for themselves. Superadmins must supply owner_id. The selected user must be an active OWNER without a brand. Creation and owner linking happen in one transaction.',
    }),
    ApiResponse({
      status: 201,
      description: 'Created brand, including its supplied code.',
    }),
    ApiResponse({
      status: 409,
      description:
        'The code is already taken, or the selected user is not an active owner without a brand.',
    }),
  );
}

export function FindAllBrandsDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'List all brands (superadmin).',
      description:
        'Returns brands across all owners. Supports page, limit, and activeOnly. activeOnly defaults to true; false includes both active and inactive brands.',
    }),
    ApiResponse({
      status: 200,
      description:
        'Paginated brands in data, with page, limit, total, and totalPages in meta.',
    }),
  );
}

export function FindOneBrandDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get an active brand.',
      description:
        'Any authenticated user can read their assigned brand. Superadmins can read any active brand. This endpoint does not return inactive brands.',
    }),
    ApiParam({
      name: 'brandId',
      schema: { type: 'string', format: 'uuid' },
      description: 'Brand ID.',
    }),
    ApiResponse({ status: 200, description: 'Active brand.' }),
    ApiResponse({ status: 404, description: 'Brand not found or inactive.' }),
  );
}

export function UpdateBrandDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update an active brand (owner or superadmin).',
      description:
        'Owners can update their assigned brand; superadmins can update any active brand. Update the name, manually supplied code, or logo_url. Omitted fields are unchanged; null clears logo_url. Renaming does not generate a code.',
    }),
    ApiParam({
      name: 'brandId',
      schema: { type: 'string', format: 'uuid' },
      description: 'Brand ID.',
    }),
    ApiResponse({ status: 200, description: 'Updated brand.' }),
    ApiResponse({ status: 409, description: 'Brand code is already taken.' }),
    ApiResponse({ status: 404, description: 'Brand not found or inactive.' }),
  );
}

export function DeleteBrandDocs() {
  return applyDecorators(
    ApiOperation({
      summary: 'Deactivate a brand (owner or superadmin).',
      description:
        'Owners can deactivate their assigned brand; superadmins can deactivate any active brand. The brand and its active users are deactivated in one transaction. Records are preserved, and affected users can no longer authenticate.',
    }),
    ApiParam({
      name: 'brandId',
      schema: { type: 'string', format: 'uuid' },
      description: 'Brand ID.',
    }),
    ApiResponse({ status: 200, description: 'Deactivated brand.' }),
    ApiResponse({
      status: 404,
      description: 'Brand not found or already inactive.',
    }),
  );
}
