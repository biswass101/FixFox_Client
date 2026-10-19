import { Request, Response } from 'express';
import { analyticsService, AnalyticsService } from './analytics.service';
import { sendSuccess } from '../../common/utils/api-response';

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService = analyticsService) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getOverview(req.user!.organizationId);
    sendSuccess(res, data);
  };

  getByCategory = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getByCategory(req.user!.organizationId);
    sendSuccess(res, data);
  };

  getByPriority = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getByPriority(req.user!.organizationId);
    sendSuccess(res, data);
  };

  getTrends = async (req: Request, res: Response): Promise<void> => {
    const days = Number(req.query.days) || 30;
    const data = await this.service.getTrends(req.user!.organizationId, days);
    sendSuccess(res, data);
  };

  getTechnicianPerformance = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.getTechnicianPerformance(req.user!.organizationId);
    sendSuccess(res, data);
  };
}

export const analyticsController = new AnalyticsController();

