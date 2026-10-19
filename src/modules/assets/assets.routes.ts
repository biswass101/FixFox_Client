import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { assetsController } from './assets.controller';
import { authenticate, authorize } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import {
  createAssetSchema,
  updateAssetSchema,
  assetQuerySchema,
} from './assets.schemas';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate(createAssetSchema),
  asyncHandler(assetsController.create)
);

router.get(
  '/',
  validate(assetQuerySchema, 'query'),
  asyncHandler(assetsController.list)
);

router.get(
  '/:id',
  asyncHandler(assetsController.getById)
);

router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate(updateAssetSchema),
  asyncHandler(assetsController.update)
);

router.delete(
  '/:id',
  authorize(UserRole.ADMIN),
  asyncHandler(assetsController.delete)
);

export { router as assetsRoutes };

