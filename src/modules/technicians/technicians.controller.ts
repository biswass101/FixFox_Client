import { Request, Response } from 'express';
import { techniciansService, TechniciansService } from './technicians.service';
import { sendSuccess } from '../../common/utils/api-response';

export class TechniciansController {
  constructor(private readonly service: TechniciansService = techniciansService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const technicians = await this.service.listTechnicians(req.user!.organizationId);
    sendSuccess(res, technicians);
  };
}

export const techniciansController = new TechniciansController();

