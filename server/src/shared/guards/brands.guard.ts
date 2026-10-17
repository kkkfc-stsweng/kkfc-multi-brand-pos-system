import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../modules/auth/auth.guard';
import { isUUID } from 'class-validator';
import { UserRole } from '@prisma/client';

@Injectable()
export class BrandsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.session?.user;

    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_LOGGED_IN',
        message: 'You are not logged in yet.',
      });
    }

    const body = request.body as { brand_id?: unknown } | undefined;
    const paramBrandId = request.params.brandId;
    const bodyBrandId = body?.brand_id;

    if (
      paramBrandId !== undefined &&
      bodyBrandId !== undefined &&
      paramBrandId !== bodyBrandId
    ) {
      throw new BadRequestException('Brand IDs must match.');
    }

    const brandId = paramBrandId ?? bodyBrandId;

    if (typeof brandId !== 'string' || !isUUID(brandId)) {
      throw new BadRequestException({
        code: 'INVALID_BRAND_ID',
        message: 'Brand ID must be a valid UUID.',
      });
    }

    const hasAccess =
      user.brand_id === brandId || user.role === UserRole.SUPERADMIN;

    if (!hasAccess) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You are not assigned to this brand',
      });
    }

    return true;
  }
}
