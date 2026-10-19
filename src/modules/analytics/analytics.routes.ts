import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { analyticsController } from './analytics.controller';
import { authenticate, authorize } from '../../common/middleware/auth';
import { asyncHandler } from '../../common/utils/async-handler';

const router = Router();

router.use(authenticate);

router.get(
  '/overview',
  asyncHandler(analyticsController.getOverview)
);

router.get(
  '/by-category',
  asyncHandler(analyticsController.getByCategory)
);

router.get(
  '/by-priority',
  asyncHandler(analyticsController.getByPriority)
);

router.get(
  '/trends',
  asyncHandler(analyticsController.getTrends)
);

router.get(
  '/technician-performance',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(analyticsController.getTechnicianPerformance)
);

export { router as analyticsRoutes };

