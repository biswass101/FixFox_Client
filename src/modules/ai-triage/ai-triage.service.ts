import {
  AIAnalysisStatus,
  NotificationType,
  UserRole,
  WorkOrderAIAnalysis,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import { createChildLogger } from '../../config/logger';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../common/errors/app-error';
import { IAITriageService } from './ai-triage.interface';
import { openRouterAITriageService } from './openrouter.service';
import { ReviewAITriageInput } from './ai-triage.schemas';
import { dispatchAITriage } from '../../queues';

const logger = createChildLogger('AITriageService');

export class AITriageService {
  constructor(
    private readonly aiService: IAITriageService = openRouterAITriageService
  ) {}

  async runTriage(
    workOrderId: string,
    organizationId: string
  ): Promise<WorkOrderAIAnalysis> {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      include: { location: true, asset: true },
    });

    if (!workOrder) {
      throw NotFoundError('Work order');
    }

    const existingAnalysis = await prisma.workOrderAIAnalysis.upsert({
      where: { workOrderId },
      create: {
        workOrderId,
        organizationId,
        model: 'pending-openrouter',
        status: AIAnalysisStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
      update: {
        status: AIAnalysisStatus.PROCESSING,
        processingStartedAt: new Date(),
        errorMessage: null,
        errorCode: null,
      },
    });

    try {
      const result = await this.aiService.analyze({
        title: workOrder.title,
        description: workOrder.description,
        locationName: workOrder.location?.name,
        assetName: workOrder.asset?.name,
        assetCategory: workOrder.asset?.category,
      });

      const completed = await prisma.workOrderAIAnalysis.update({
        where: { id: existingAnalysis.id },
        data: {
          model: result.model,
          suggestedCategory: result.suggestedCategory,
          suggestedPriority: result.suggestedPriority,
          summary: result.summary,
          safetyFlags: result.safetyFlags,
          rationale: result.rationale,
          confidence: result.confidence,
          tokenUsage: result.tokenUsage,
          status: AIAnalysisStatus.COMPLETED,
          processingCompletedAt: new Date(),
        },
      });

      const managers = await prisma.user.findMany({
        where: {
          organizationId,
          role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
          isActive: true,
        },
        select: { id: true },
      });

      if (managers.length > 0) {
        await prisma.notification.createMany({
          data: managers.map((m) => ({
            organizationId,
            recipientId: m.id,
            workOrderId,
            type: NotificationType.AI_ANALYSIS_COMPLETED,
            title: 'AI Triage Completed',
            body: `AI suggested ${result.suggestedPriority} priority and ${result.suggestedCategory} category for "${workOrder.title.slice(0, 50)}"`,
          })),
        });
      }

      return completed;
    } catch (error: any) {
      logger.error({ error, workOrderId }, 'AI triage execution failed');

      return prisma.workOrderAIAnalysis.update({
        where: { id: existingAnalysis.id },
        data: {
          status: AIAnalysisStatus.FAILED,
          errorCode: error.code || 'AI_TRIAGE_FAILED',
          errorMessage: error.message || 'AI Triage processing failed',
          processingCompletedAt: new Date(),
        },
      });
    }
  }

  async getAnalysis(
    organizationId: string,
    workOrderId: string
  ): Promise<WorkOrderAIAnalysis> {
    const analysis = await prisma.workOrderAIAnalysis.findFirst({
      where: { workOrderId, organizationId },
    });

    if (!analysis) {
      throw NotFoundError('AI analysis for this work order');
    }

    return analysis;
  }

  async retryTriage(
    organizationId: string,
    workOrderId: string,
    userRole: UserRole
  ): Promise<{ message: string; jobId?: string }> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can trigger AI triage retries');
    }

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
    });

    if (!workOrder) {
      throw NotFoundError('Work order');
    }

    await prisma.workOrderAIAnalysis.upsert({
      where: { workOrderId },
      create: {
        workOrderId,
        organizationId,
        model: 'pending-openrouter',
        status: AIAnalysisStatus.PENDING,
      },
      update: {
        status: AIAnalysisStatus.PENDING,
        errorMessage: null,
      },
    });

    const jobId = await dispatchAITriage({
      workOrderId,
      organizationId,
      isRetry: true,
    });

    return {
      message: 'AI triage job scheduled successfully',
      jobId,
    };
  }

  async reviewAnalysis(
    organizationId: string,
    workOrderId: string,
    userId: string,
    userRole: UserRole,
    input: ReviewAITriageInput
  ): Promise<WorkOrderAIAnalysis> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can review AI triage suggestions');
    }

    const analysis = await prisma.workOrderAIAnalysis.findFirst({
      where: { workOrderId, organizationId },
    });

    if (!analysis) {
      throw NotFoundError('AI analysis for this work order');
    }

    if (analysis.status === AIAnalysisStatus.PENDING || analysis.status === AIAnalysisStatus.PROCESSING) {
      throw BadRequestError('Cannot review analysis while AI triage is still in progress');
    }

    const finalCategory = input.accepted ? analysis.suggestedCategory! : input.finalCategory!;
    const finalPriority = input.accepted ? analysis.suggestedPriority! : input.finalPriority!;

    return prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          category: finalCategory,
          priority: finalPriority,
          version: { increment: 1 },
        },
      });

      return tx.workOrderAIAnalysis.update({
        where: { id: analysis.id },
        data: {
          status: AIAnalysisStatus.REVIEWED,
          reviewedById: userId,
          reviewedAt: new Date(),
          accepted: input.accepted,
          overrideReason: input.overrideReason || null,
          finalCategory,
          finalPriority,
        },
      });
    });
  }
}

export const aiTriageService = new AITriageService();

