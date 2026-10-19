import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../common/middleware/validate';
import { authenticate } from '../../common/middleware/auth';
import { authRateLimiter } from '../../config/security';
import { asyncHandler } from '../../common/utils/async-handler';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schemas';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  asyncHandler(authController.register)
);

router.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  asyncHandler(authController.login)
);

router.post(
  '/refresh',
  asyncHandler(authController.refresh)
);

router.post(
  '/logout',
  asyncHandler(authController.logout)
);

router.get(
  '/me',
  authenticate,
  asyncHandler(authController.me)
);

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword)
);

router.post(
  '/forgot-password',
  authRateLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword)
);

router.post(
  '/reset-password',
  authRateLimiter,
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword)
);

export { router as authRoutes };

