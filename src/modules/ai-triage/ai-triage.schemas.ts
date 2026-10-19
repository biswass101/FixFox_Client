import { z } from 'zod';
import { WorkOrderCategory, WorkOrderPriority } from '@prisma/client';

export const aiTriageOutputSchema = z.object({
  suggestedCategory: z.nativeEnum(WorkOrderCategory),
  suggestedPriority: z.nativeEnum(WorkOrderPriority),
  summary: z.string().trim().min(5).max(500),
  safetyFlags: z.array(z.string().trim().max(200)).default([]),
  rationale: z.string().trim().min(5).max(1000),
  confidence: z.coerce.number().min(0).max(1).default(0.85),
});

export const reviewAITriageSchema = z
  .object({
    accepted: z.boolean(),
    overrideReason: z.string().trim().max(500).optional(),
    finalCategory: z.nativeEnum(WorkOrderCategory).optional(),
    finalPriority: z.nativeEnum(WorkOrderPriority).optional(),
  })
  .refine(
    (data) => {
      if (!data.accepted) {
        return !!data.overrideReason && !!data.finalCategory && !!data.finalPriority;
      }
      return true;
    },
    {
      message:
        'When overriding AI suggestion, overrideReason, finalCategory, and finalPriority are required',
      path: ['overrideReason'],
    }
  );

export type AITriageOutput = z.infer<typeof aiTriageOutputSchema>;
export type ReviewAITriageInput = z.infer<typeof reviewAITriageSchema>;

