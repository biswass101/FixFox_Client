import { z } from 'zod';
import {
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderCategory,
  CostType,
} from '@prisma/client';

export const createWorkOrderSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters'),
  locationId: z.string().uuid('Invalid location ID'),
  assetId: z.string().uuid('Invalid asset ID').optional(),
  category: z.nativeEnum(WorkOrderCategory).default(WorkOrderCategory.GENERAL),
  priority: z.nativeEnum(WorkOrderPriority).default(WorkOrderPriority.MEDIUM),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(5).optional(),
  locationId: z.string().uuid().optional(),
  assetId: z.string().uuid().nullable().optional(),
  category: z.nativeEnum(WorkOrderCategory).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  version: z.number().int().positive('Current work order version is required'),
});

export const assignTechnicianSchema = z.object({
  technicianId: z.string().uuid('Invalid technician ID'),
  reason: z.string().trim().max(255).optional(),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus),
  reason: z.string().trim().max(500).optional(),
  version: z.number().int().positive().optional(),
});

export const resolveWorkOrderSchema = z.object({
  resolutionSummary: z
    .string()
    .trim()
    .min(5, 'Resolution summary must be at least 5 characters')
    .max(2000),
});

export const reopenWorkOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Reopen reason must be at least 5 characters')
    .max(500),
});

export const createNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note content cannot be empty'),
  isInternal: z.boolean().default(false),
});

export const createCostSchema = z.object({
  type: z.nativeEnum(CostType),
  description: z.string().trim().min(1, 'Description is required').max(255),
  quantity: z.number().positive('Quantity must be greater than zero'),
  unitCost: z.number().min(0, 'Unit cost cannot be negative'),
  laborHours: z.number().positive().optional(),
  currency: z.string().default('BDT'),
});

export const updateCostSchema = createCostSchema.partial();

export const workOrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(WorkOrderStatus).optional(),
  category: z.nativeEnum(WorkOrderCategory).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  assigneeId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  reporterId: z.string().uuid().optional(),
  sortBy: z
    .enum(['createdAt', 'dueAt', 'priority', 'status', 'title'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type AssignTechnicianInput = z.infer<typeof assignTechnicianSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ResolveWorkOrderInput = z.infer<typeof resolveWorkOrderSchema>;
export type ReopenWorkOrderInput = z.infer<typeof reopenWorkOrderSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type CreateCostInput = z.infer<typeof createCostSchema>;
export type UpdateCostInput = z.infer<typeof updateCostSchema>;
export type WorkOrderQueryParams = z.infer<typeof workOrderQuerySchema>;

