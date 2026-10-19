import { z } from 'zod';

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  building: z.string().trim().max(100).optional(),
  floor: z.string().trim().max(50).optional(),
  room: z.string().trim().max(50).optional(),
  description: z.string().trim().max(500).optional(),
});

export const updateLocationSchema = createLocationSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const locationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  building: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type LocationQueryParams = z.infer<typeof locationQuerySchema>;

