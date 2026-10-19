import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { techniciansController } from './technicians.controller';
import { authenticate, authorize } from '../../common/middleware/auth';
import { asyncHandler } from '../../common/utils/async-handler';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(techniciansController.list)
);

export { router as techniciansRoutes };

