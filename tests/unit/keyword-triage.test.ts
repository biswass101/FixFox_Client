import { describe, it, expect } from 'vitest';
import { WorkOrderCategory, WorkOrderPriority } from '@prisma/client';
import { runKeywordTriage } from '../../src/modules/ai-triage/keyword-triage';

describe('Keyword Triage Baseline Engine', () => {
  it('correctly classifies fire and smoke hazards as CRITICAL FIRE_SAFETY', () => {
    const result = runKeywordTriage({
      title: 'Smoke detected near electrical riser',
      description: 'Smell of burning rubber and light smoke visible in corridor.',
    });

    expect(result.suggestedCategory).toBe(WorkOrderCategory.FIRE_SAFETY);
    expect(result.suggestedPriority).toBe(WorkOrderPriority.CRITICAL);
    expect(result.safetyFlags).toContain('Fire / Life Safety Risk');
  });

  it('correctly classifies burst pipe flooding as CRITICAL PLUMBING', () => {
    const result = runKeywordTriage({
      title: 'Water pipe burst',
      description: 'Major flood happening in basement storeroom.',
    });

    expect(result.suggestedCategory).toBe(WorkOrderCategory.PLUMBING);
    expect(result.suggestedPriority).toBe(WorkOrderPriority.CRITICAL);
  });

  it('correctly classifies HVAC overheating in server rooms as HIGH priority', () => {
    const result = runKeywordTriage({
      title: 'Server room AC unit down',
      description: 'Chiller stopped blowing cold air, server rack temperatures rising rapidly.',
    });

    expect(result.suggestedCategory).toBe(WorkOrderCategory.HVAC);
    expect(result.suggestedPriority).toBe(WorkOrderPriority.HIGH);
  });

  it('correctly identifies trapped passengers in elevator as CRITICAL', () => {
    const result = runKeywordTriage({
      title: 'Elevator stopped between floors',
      description: 'Two staff members trapped in passenger lift 2.',
    });

    expect(result.suggestedCategory).toBe(WorkOrderCategory.ELEVATOR);
    expect(result.suggestedPriority).toBe(WorkOrderPriority.CRITICAL);
    expect(result.safetyFlags).toContain('Occupant Trapped in Elevator');
  });

  it('defaults benign cleaning requests to LOW priority', () => {
    const result = runKeywordTriage({
      title: 'Spilled water in kitchen',
      description: 'Need someone to clean the floor after lunch spill.',
    });

    expect(result.suggestedCategory).toBe(WorkOrderCategory.CLEANING);
    expect(result.suggestedPriority).toBe(WorkOrderPriority.LOW);
  });
});

