import { WorkOrderStatus, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';

export class AnalyticsService {
  async getOverview(organizationId: string) {
    const now = new Date();

    const [
      totalCount,
      openCount,
      assignedCount,
      inProgressCount,
      resolvedCount,
      closedCount,
      overdueCount,
      costsAggregate,
      resolvedOrders,
    ] = await Promise.all([
      prisma.workOrder.count({ where: { organizationId } }),
      prisma.workOrder.count({
        where: { organizationId, status: WorkOrderStatus.OPEN },
      }),
      prisma.workOrder.count({
        where: { organizationId, status: WorkOrderStatus.ASSIGNED },
      }),
      prisma.workOrder.count({
        where: { organizationId, status: WorkOrderStatus.IN_PROGRESS },
      }),
      prisma.workOrder.count({
        where: { organizationId, status: WorkOrderStatus.RESOLVED },
      }),
      prisma.workOrder.count({
        where: { organizationId, status: WorkOrderStatus.CLOSED },
      }),
      prisma.workOrder.count({
        where: {
          organizationId,
          status: {
            in: [
              WorkOrderStatus.OPEN,
              WorkOrderStatus.ASSIGNED,
              WorkOrderStatus.IN_PROGRESS,
            ],
          },
          dueAt: { lt: now },
        },
      }),
      prisma.workOrderCost.aggregate({
        where: { organizationId },
        _sum: { totalCost: true },
      }),
      prisma.workOrder.findMany({
        where: {
          organizationId,
          status: { in: [WorkOrderStatus.RESOLVED, WorkOrderStatus.CLOSED] },
          resolvedAt: { not: null },
        },
        select: { createdAt: true, resolvedAt: true },
        take: 200,
      }),
    ]);

    let meanTimeToResolveHours = 0;
    if (resolvedOrders.length > 0) {
      const totalHours = resolvedOrders.reduce((acc, order) => {
        if (!order.resolvedAt) return acc;
        const diffMs = order.resolvedAt.getTime() - order.createdAt.getTime();
        return acc + diffMs / (1000 * 60 * 60);
      }, 0);
      meanTimeToResolveHours = Number((totalHours / resolvedOrders.length).toFixed(1));
    }

    const totalCost = costsAggregate._sum.totalCost
      ? Number(costsAggregate._sum.totalCost.toFixed(2))
      : 0;

    return {
      totalWorkOrders: totalCount,
      countsByStatus: {
        open: openCount,
        assigned: assignedCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
        closed: closedCount,
      },
      overdueCount,
      meanTimeToResolveHours,
      totalMaintenanceCost: totalCost,
    };
  }

  async getByCategory(organizationId: string) {
    const groups = await prisma.workOrder.groupBy({
      by: ['category'],
      where: { organizationId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return groups.map((g) => ({
      category: g.category,
      count: g._count.id,
    }));
  }

  async getByPriority(organizationId: string) {
    const groups = await prisma.workOrder.groupBy({
      by: ['priority'],
      where: { organizationId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return groups.map((g) => ({
      priority: g.priority,
      count: g._count.id,
    }));
  }

  async getTrends(organizationId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const workOrders = await prisma.workOrder.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    const dayMap = new Map<string, { date: string; created: number; resolved: number }>();

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateKey = d.toISOString().split('T')[0];
      dayMap.set(dateKey, { date: dateKey, created: 0, resolved: 0 });
    }

    for (const wo of workOrders) {
      const createdKey = wo.createdAt.toISOString().split('T')[0];
      if (dayMap.has(createdKey)) {
        dayMap.get(createdKey)!.created += 1;
      }

      if (wo.resolvedAt) {
        const resolvedKey = wo.resolvedAt.toISOString().split('T')[0];
        if (dayMap.has(resolvedKey)) {
          dayMap.get(resolvedKey)!.resolved += 1;
        }
      }
    }

    return Array.from(dayMap.values());
  }

  async getTechnicianPerformance(organizationId: string) {
    const technicians = await prisma.user.findMany({
      where: {
        organizationId,
        role: UserRole.TECHNICIAN,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        skills: true,
        assignedWorkOrders: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return technicians.map((tech) => {
      const activeCount = tech.assignedWorkOrders.filter(
        (o) =>
          o.status === WorkOrderStatus.ASSIGNED ||
          o.status === WorkOrderStatus.IN_PROGRESS
      ).length;

      const completedCount = tech.assignedWorkOrders.filter(
        (o) =>
          o.status === WorkOrderStatus.RESOLVED ||
          o.status === WorkOrderStatus.CLOSED
      ).length;

      return {
        id: tech.id,
        fullName: tech.fullName,
        email: tech.email,
        skills: tech.skills,
        activeWorkOrders: activeCount,
        completedWorkOrders: completedCount,
        totalAssigned: tech.assignedWorkOrders.length,
      };
    });
  }
}

export const analyticsService = new AnalyticsService();
