import { WorkOrderCategory, WorkOrderPriority } from '@prisma/client';

export interface AITriageInput {
  title: string;
  description: string;
  locationName?: string;
  assetName?: string;
  assetCategory?: string;
}

export interface AITriageResult {
  suggestedCategory: WorkOrderCategory;
  suggestedPriority: WorkOrderPriority;
  summary: string;
  safetyFlags: string[];
  rationale: string;
  confidence: number;
  model: string;
  tokenUsage?: number;
}

export interface IAITriageService {
  analyze(input: AITriageInput): Promise<AITriageResult>;
}

