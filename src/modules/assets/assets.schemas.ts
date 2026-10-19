import { z } from 'zod';
import { AssetCondition } from '@prisma/client';

export const createAssetSchema = z.object({
  locationId: z.string().uuid('Invalid location ID'),
  assetCode: z.string().trim().min(1, 'Asset code is required').max(50),
  name: z.string().trim().min(1, 'Name is required').max(100),
  category: z.string().trim().min(1, 'Category is required').max(50),
  manufacturer: z.string().trim().max(100).optional(),
  modelNumber: z.string().trim().max(100).optional(),
  serialNumber: z.string().trim().max(100).optional(),
  purchaseDate: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
  warrantyExpiresAt: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
  condition: z.nativeEnum(AssetCondition).default(AssetCondition.GOOD),
});

export const updateAssetSchema = createAssetSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const assetQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  locationId: z.string().uuid().optional(),
  category: z.string().trim().optional(),
  condition: z.nativeEnum(AssetCondition).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type AssetQueryParams = z.infer<typeof assetQuerySchema>;

