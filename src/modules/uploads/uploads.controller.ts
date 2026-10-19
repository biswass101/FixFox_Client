import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { uploadsService, UploadsService } from './uploads.service';
import { sendCreated, sendSuccess, sendNoContent } from '../../common/utils/api-response';

export class UploadsController {
  constructor(private readonly service: UploadsService = uploadsService) {}

  upload = async (req: Request, res: Response): Promise<void> => {
    const image = await this.service.uploadWorkOrderImage(
      req.user!.organizationId,
      req.params.id,
      req.user!.userId,
      req.user!.role as UserRole,
      req.body
    );
    sendCreated(res, image);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const images = await this.service.listWorkOrderImages(
      req.user!.organizationId,
      req.params.id,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, images);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteWorkOrderImage(
      req.user!.organizationId,
      req.params.id,
      req.params.imageId,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendNoContent(res);
  };
}

export const uploadsController = new UploadsController();

