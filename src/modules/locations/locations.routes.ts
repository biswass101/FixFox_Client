import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { locationsController } from './locations.controller';
import { authenticate, authorize } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import {
  createLocationSchema,
  updateLocationSchema,
  locationQuerySchema,
} from './locations.schemas';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate(createLocationSchema),
  asyncHandler(locationsController.create)
);

router.get(
  '/',
  validate(locationQuerySchema, 'query'),
  asyncHandler(locationsController.list)
);

router.get(
  '/:id',
  asyncHandler(locationsController.getById)
);

router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate(updateLocationSchema),
  asyncHandler(locationsController.update)
);

router.delete(
  '/:id',
  authorize(UserRole.ADMIN),
  asyncHandler(locationsController.delete)
);

export { router as locationsRoutes };

