import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/async-handler';
import { notificationQuerySchema } from './notifications.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  validate(notificationQuerySchema, 'query'),
  asyncHandler(notificationsController.list)
);

router.get(
  '/unread-count',
  asyncHandler(notificationsController.unreadCount)
);

router.patch(
  '/:id/read',
  asyncHandler(notificationsController.markRead)
);

router.post(
  '/mark-all-read',
  asyncHandler(notificationsController.markAllRead)
);

export { router as notificationsRoutes };

