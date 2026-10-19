import { Request, Response } from 'express';
import { assetsService, AssetsService } from './assets.service';
import {
  sendCreated,
  sendSuccess,
  sendPaginated,
  sendNoContent,
  createPaginationMeta,
} from '../../common/utils/api-response';

export class AssetsController {
  constructor(private readonly service: AssetsService = assetsService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const asset = await this.service.create(req.user!.organizationId, req.body);
    sendCreated(res, asset);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const asset = await this.service.getById(req.user!.organizationId, req.params.id);
    sendSuccess(res, asset);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, total } = await this.service.list(
      req.user!.organizationId,
      req.query as any
    );
    const pagination = createPaginationMeta(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20,
      total
    );
    sendPaginated(res, items, pagination);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const asset = await this.service.update(
      req.user!.organizationId,
      req.params.id,
      req.body
    );
    sendSuccess(res, asset);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.delete(req.user!.organizationId, req.params.id);
    sendNoContent(res);
  };
}

export const assetsController = new AssetsController();

