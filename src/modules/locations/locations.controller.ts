import { Request, Response } from 'express';
import { locationsService, LocationsService } from './locations.service';
import {
  sendCreated,
  sendSuccess,
  sendPaginated,
  sendNoContent,
  createPaginationMeta,
} from '../../common/utils/api-response';

export class LocationsController {
  constructor(private readonly service: LocationsService = locationsService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const location = await this.service.create(req.user!.organizationId, req.body);
    sendCreated(res, location);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const location = await this.service.getById(req.user!.organizationId, req.params.id);
    sendSuccess(res, location);
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
    const location = await this.service.update(
      req.user!.organizationId,
      req.params.id,
      req.body
    );
    sendSuccess(res, location);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.delete(req.user!.organizationId, req.params.id);
    sendNoContent(res);
  };
}

export const locationsController = new LocationsController();

