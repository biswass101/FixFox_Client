import { Request, Response } from 'express';
import { notificationsService, NotificationsService } from './notifications.service';
import { sendSuccess, sendPaginated, createPaginationMeta } from '../../common/utils/api-response';

export class NotificationsController {
  constructor(private readonly service: NotificationsService = notificationsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, total } = await this.service.list(
      req.user!.organizationId,
      req.user!.userId,
      req.query as any
    );
    const pagination = createPaginationMeta(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20,
      total
    );
    sendPaginated(res, items, pagination);
  };

  unreadCount = async (req: Request, res: Response): Promise<void> => {
    const count = await this.service.getUnreadCount(
      req.user!.organizationId,
      req.user!.userId
    );
    sendSuccess(res, { unreadCount: count });
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const notification = await this.service.markAsRead(
      req.user!.organizationId,
      req.user!.userId,
      req.params.id
    );
    sendSuccess(res, notification);
  };

  markAllRead = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.markAllAsRead(
      req.user!.organizationId,
      req.user!.userId
    );
    sendSuccess(res, result);
  };
}

export const notificationsController = new NotificationsController();

