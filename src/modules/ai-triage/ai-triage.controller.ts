import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { aiTriageService, AITriageService } from './ai-triage.service';
import { sendSuccess } from '../../common/utils/api-response';

export class AITriageController {
  constructor(private readonly service: AITriageService = aiTriageService) {}

  getAnalysis = async (req: Request, res: Response): Promise<void> => {
    const analysis = await this.service.getAnalysis(
      req.user!.organizationId,
      req.params.id
    );
    sendSuccess(res, analysis);
  };

  retryTriage = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.retryTriage(
      req.user!.organizationId,
      req.params.id,
      req.user!.role as UserRole
    );
    sendSuccess(res, result);
  };

  reviewAnalysis = async (req: Request, res: Response): Promise<void> => {
    const analysis = await this.service.reviewAnalysis(
      req.user!.organizationId,
      req.params.id,
      req.user!.userId,
      req.user!.role as UserRole,
      req.body
    );
    sendSuccess(res, analysis);
  };
}

export const aiTriageController = new AITriageController();

