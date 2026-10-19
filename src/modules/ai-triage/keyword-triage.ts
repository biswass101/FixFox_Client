import { WorkOrderCategory, WorkOrderPriority } from '@prisma/client';
import { AITriageInput, AITriageResult } from './ai-triage.interface';

export function runKeywordTriage(input: AITriageInput): AITriageResult {
  const combined = `${input.title} ${input.description} ${input.assetCategory || ''}`.toLowerCase();

  let category: WorkOrderCategory = WorkOrderCategory.GENERAL;
  let priority: WorkOrderPriority = WorkOrderPriority.MEDIUM;
  const safetyFlags: string[] = [];

  if (combined.includes('fire') || combined.includes('smoke') || combined.includes('alarm')) {
    category = WorkOrderCategory.FIRE_SAFETY;
    priority = WorkOrderPriority.CRITICAL;
    safetyFlags.push('Fire / Life Safety Risk');
  } else if (combined.includes('clean') || combined.includes('trash') || combined.includes('spill') || combined.includes('mop')) {
    category = WorkOrderCategory.CLEANING;
    priority = WorkOrderPriority.LOW;
  } else if (combined.includes('leak') || combined.includes('pipe') || combined.includes('drain') || combined.includes('faucet') || combined.includes('toilet') || combined.includes('plumbing')) {
    category = WorkOrderCategory.PLUMBING;
    priority = combined.includes('flood') || combined.includes('burst') ? WorkOrderPriority.CRITICAL : WorkOrderPriority.HIGH;
  } else if (combined.includes('hvac') || combined.includes('ac') || combined.includes('chiller') || combined.includes('heat') || combined.includes('cooling')) {
    category = WorkOrderCategory.HVAC;
    priority = combined.includes('server') || combined.includes('overheating') ? WorkOrderPriority.HIGH : WorkOrderPriority.MEDIUM;
  } else if (combined.includes('wire') || combined.includes('electric') || combined.includes('power') || combined.includes('spark') || combined.includes('breaker')) {
    category = WorkOrderCategory.ELECTRICAL;
    priority = combined.includes('spark') || combined.includes('exposed') ? WorkOrderPriority.CRITICAL : WorkOrderPriority.HIGH;
    if (combined.includes('spark') || combined.includes('exposed')) {
      safetyFlags.push('Electrocution / Spark Risk');
    }
  } else if (combined.includes('elevator') || combined.includes('lift')) {
    category = WorkOrderCategory.ELEVATOR;
    priority = combined.includes('trapped') ? WorkOrderPriority.CRITICAL : WorkOrderPriority.HIGH;
    if (combined.includes('trapped')) {
      safetyFlags.push('Occupant Trapped in Elevator');
    }
  } else if (combined.includes('pest') || combined.includes('rodent') || combined.includes('bug') || combined.includes('termite')) {
    category = WorkOrderCategory.PEST_CONTROL;
    priority = WorkOrderPriority.LOW;
  }

  return {
    suggestedCategory: category,
    suggestedPriority: priority,
    summary: input.title.slice(0, 300),
    safetyFlags,
    rationale: `Rule-based keyword triage matched keywords in title/description.`,
    confidence: 0.75,
    model: 'heuristic-rule-engine',
  };
}
