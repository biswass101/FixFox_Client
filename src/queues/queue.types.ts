export const QUEUE_NAMES = {
  AI_TRIAGE: 'ai-triage',
  EMAIL: 'email-notifications',
  SLA_MONITOR: 'sla-monitor',
  RECURRING_FAULT: 'recurring-fault',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface AITriageJobPayload {
  workOrderId: string;
  organizationId: string;
  isRetry?: boolean;
}

export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface SlaMonitorJobPayload {
  organizationId?: string;
  timestamp: number;
}

export interface RecurringFaultJobPayload {
  organizationId?: string;
  timestamp: number;
}

