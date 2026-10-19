import { Notification, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { NotFoundError } from '../../common/errors/app-error';
import { NotificationQueryParams } from './notifications.schemas';

export class NotificationsService {
  async list(
    organizationId: string,
    recipientId: string,
    params: NotificationQueryParams
  ): Promise<{ items: Notification[]; total: number }> {
    const where: Prisma.NotificationWhereInput = {
      organizationId,
      recipientId,
      ...(params.unreadOnly ? { readAt: null } : {}),
    };

    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  async getUnreadCount(organizationId: string, recipientId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        organizationId,
        recipientId,
        readAt: null,
      },
    });
  }

  async markAsRead(
    organizationId: string,
    recipientId: string,
    notificationId: string
  ): Promise<Notification> {
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        organizationId,
        recipientId,
      },
    });

    if (!notification) {
      throw NotFoundError('Notification');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(organizationId: string, recipientId: string): Promise<{ count: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        organizationId,
        recipientId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { count: result.count };
  }
}

export const notificationsService = new NotificationsService();

