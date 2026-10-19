import { describe, it, expect } from 'vitest';
import { WorkOrderCategory, WorkOrderPriority } from '@prisma/client';
import {
  aiTriageOutputSchema,
  reviewAITriageSchema,
} from '../../src/modules/ai-triage/ai-triage.schemas';

describe('AI Triage Validation Schemas', () => {
  describe('aiTriageOutputSchema', () => {
    it('validates a valid AI triage result', () => {
      const valid = {
        suggestedCategory: WorkOrderCategory.HVAC,
        suggestedPriority: WorkOrderPriority.HIGH,
        summary: 'Primary chiller is leaking coolant on level 2.',
        safetyFlags: ['Chemical leak hazard'],
        rationale: 'Coolant leaks can cause equipment overheating and health risks.',
        confidence: 0.92,
      };

      const result = aiTriageOutputSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.suggestedCategory).toBe(WorkOrderCategory.HVAC);
        expect(result.data.confidence).toBe(0.92);
      }
    });

    it('rejects invalid or unauthorized categories', () => {
      const invalid = {
        suggestedCategory: 'SPACE_TRAVEL',
        suggestedPriority: WorkOrderPriority.MEDIUM,
        summary: 'Non-existent category test.',
        safetyFlags: [],
        rationale: 'Valid rationale here.',
        confidence: 0.8,
      };

      const result = aiTriageOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects confidence out of bounds', () => {
      const invalidConfidence = {
        suggestedCategory: WorkOrderCategory.PLUMBING,
        suggestedPriority: WorkOrderPriority.LOW,
        summary: 'Sink dripping slowly.',
        safetyFlags: [],
        rationale: 'Minor drip.',
        confidence: 1.5,
      };

      const result = aiTriageOutputSchema.safeParse(invalidConfidence);
      expect(result.success).toBe(false);
    });
  });

  describe('reviewAITriageSchema', () => {
    it('accepts valid acceptance payload', () => {
      const acceptPayload = {
        accepted: true,
      };

      const result = reviewAITriageSchema.safeParse(acceptPayload);
      expect(result.success).toBe(true);
    });

    it('requires override reason, category, and priority when overriding', () => {
      const invalidOverride = {
        accepted: false,
      };

      const result = reviewAITriageSchema.safeParse(invalidOverride);
      expect(result.success).toBe(false);

      const validOverride = {
        accepted: false,
        overrideReason: 'Changed based on onsite engineering assessment',
        finalCategory: WorkOrderCategory.ELECTRICAL,
        finalPriority: WorkOrderPriority.CRITICAL,
      };

      const validResult = reviewAITriageSchema.safeParse(validOverride);
      expect(validResult.success).toBe(true);
    });
  });
});

