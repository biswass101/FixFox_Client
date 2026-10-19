import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { invitationsController } from './invitations.controller';
import { authenticate, authorize } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import {
  createInvitationSchema,
  acceptInvitationSchema,
} from './invitations.schemas';

const router = Router();

router.get(
  '/verify/:token',
  asyncHandler(invitationsController.verify)
);

router.post(
  '/accept',
  validate(acceptInvitationSchema),
  asyncHandler(invitationsController.accept)
);

router.use(authenticate);

router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate(createInvitationSchema),
  asyncHandler(invitationsController.create)
);

router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(invitationsController.list)
);

router.post(
  '/:id/revoke',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(invitationsController.revoke)
);

export { router as invitationsRoutes };

