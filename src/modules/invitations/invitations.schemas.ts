import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const createInvitationSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  role: z.nativeEnum(UserRole),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(10, 'Invitation token is required'),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

