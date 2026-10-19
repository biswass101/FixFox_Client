import {
  WorkOrder,
  WorkOrderStatus,
  Prisma,
  UserRole,
  WorkNote,
  WorkOrderCost,
} from '@prisma/client';
import { prisma } from '../../database/prisma';
import type {
  CreateWorkOrderInput,
  WorkOrderQueryParams,
  CreateCostInput,
} from './work-orders.schemas';

export class WorkOrdersRepository {
  async create(
    organizationId: string,
    reporterId: string,
    data: CreateWorkOrderInput,
    dueAt: Date | null
  ): Promise<WorkOrder> {
    return prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.create({
        data: {
          organizationId,
          reporterId,
          locationId: data.locationId,
          assetId: data.assetId,
          title: data.title,
          description: data.description,
          category: data.category,
          priority: data.priority,
          status: WorkOrderStatus.OPEN,
          dueAt,
          version: 1,
        },
      });

      await tx.workOrderStatusHistory.create({
        data: {
          organizationId,
          workOrderId: workOrder.id,
          changedById: reporterId,
          previousStatus: null,
          newStatus: WorkOrderStatus.OPEN,
          reason: 'Work order created',
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: reporterId,
          action: 'WORK_ORDER_CREATED',
          entityType: 'WorkOrder',
          entityId: workOrder.id,
          metadata: {
            title: workOrder.title,
            priority: workOrder.priority,
            category: workOrder.category,
          },
        },
      });

      return workOrder;
    });
  }

  async findById(
    organizationId: string,
    id: string,
    includeInternalNotes = true
  ) {
    return prisma.workOrder.findFirst({
      where: { id, organizationId },
      include: {
        reporter: {
          select: { id: true, fullName: true, email: true },
        },
        assignee: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        location: true,
        asset: true,
        images: true,
        aiAnalysis: true,
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            technician: { select: { id: true, fullName: true, email: true } },
            assignedBy: { select: { id: true, fullName: true, email: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: { select: { id: true, fullName: true, email: true } },
          },
        },
        workNotes: {
          where: includeInternalNotes ? {} : { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, fullName: true, email: true } },
          },
        },
        costs: {
          orderBy: { createdAt: 'asc' },
          include: {
            createdBy: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
  }

  async findMany(
    organizationId: string,
    params: WorkOrderQueryParams,
    viewerRole: UserRole,
    viewerId: string
  ): Promise<{ items: any[]; total: number }> {
    const where: Prisma.WorkOrderWhereInput = {
      organizationId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.category ? { category: params.category } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.locationId ? { locationId: params.locationId } : {}),
      ...(params.assetId ? { assetId: params.assetId } : {}),
      ...(params.assigneeId ? { assigneeId: params.assigneeId } : {}),
      ...(params.reporterId ? { reporterId: params.reporterId } : {}),
      ...(viewerRole === UserRole.REPORTER ? { reporterId: viewerId } : {}),
      ...(viewerRole === UserRole.TECHNICIAN ? { assigneeId: viewerId } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' } },
              { description: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;
    const orderBy: Prisma.WorkOrderOrderByWithRelationInput = {
      [params.sortBy]: params.sortOrder,
    };

    const [items, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        skip,
        take: params.limit,
        orderBy,
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          assignee: { select: { id: true, fullName: true, email: true } },
          location: { select: { id: true, name: true, building: true } },
          asset: { select: { id: true, name: true, assetCode: true } },
          _count: {
            select: {
              workNotes: true,
              costs: true,
              images: true,
            },
          },
        },
      }),
      prisma.workOrder.count({ where }),
    ]);

    return { items, total };
  }

  async updateOptimistic(
    organizationId: string,
    id: string,
    currentVersion: number,
    data: Prisma.WorkOrderUpdateInput
  ): Promise<WorkOrder | null> {
    try {
      return await prisma.workOrder.update({
        where: {
          id,
          organizationId,
          version: currentVersion,
        },
        data: {
          ...data,
          version: { increment: 1 },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return null;
      }
      throw err;
    }
  }

  async assignTechnician(
    organizationId: string,
    workOrderId: string,
    technicianId: string,
    assignedById: string,
    reason?: string
  ): Promise<WorkOrder> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.workOrder.findUnique({
        where: { id: workOrderId, organizationId },
      });

      if (!current) {
        throw new Error('Work order not found');
      }

      await tx.workOrderAssignment.create({
        data: {
          organizationId,
          workOrderId,
          technicianId,
          assignedById,
          reason,
        },
      });

      const newStatus =
        current.status === WorkOrderStatus.OPEN
          ? WorkOrderStatus.ASSIGNED
          : current.status;

      const updated = await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          assigneeId: technicianId,
          assignedAt: new Date(),
          status: newStatus,
          version: { increment: 1 },
        },
      });

      if (newStatus !== current.status) {
        await tx.workOrderStatusHistory.create({
          data: {
            organizationId,
            workOrderId,
            changedById: assignedById,
            previousStatus: current.status,
            newStatus,
            reason: reason || 'Technician assigned',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: assignedById,
          action: 'WORK_ORDER_ASSIGNED',
          entityType: 'WorkOrder',
          entityId: workOrderId,
          metadata: { technicianId, reason },
        },
      });

      return updated;
    });
  }

  async updateStatus(
    organizationId: string,
    workOrderId: string,
    changedById: string,
    newStatus: WorkOrderStatus,
    reason?: string,
    extraData?: {
      startedAt?: Date;
      resolvedAt?: Date;
      closedAt?: Date;
      resolutionSummary?: string;
    }
  ): Promise<WorkOrder> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.workOrder.findUnique({
        where: { id: workOrderId, organizationId },
      });

      if (!current) {
        throw new Error('Work order not found');
      }

      const updated = await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          status: newStatus,
          version: { increment: 1 },
          ...(extraData?.startedAt ? { startedAt: extraData.startedAt } : {}),
          ...(extraData?.resolvedAt ? { resolvedAt: extraData.resolvedAt } : {}),
          ...(extraData?.closedAt ? { closedAt: extraData.closedAt } : {}),
          ...(extraData?.resolutionSummary
            ? { resolutionSummary: extraData.resolutionSummary }
            : {}),
        },
      });

      await tx.workOrderStatusHistory.create({
        data: {
          organizationId,
          workOrderId,
          changedById,
          previousStatus: current.status,
          newStatus,
          reason,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: changedById,
          action: `WORK_ORDER_STATUS_${newStatus}`,
          entityType: 'WorkOrder',
          entityId: workOrderId,
          metadata: {
            previousStatus: current.status,
            newStatus,
            reason,
          },
        },
      });

      return updated;
    });
  }

  async createNote(
    organizationId: string,
    workOrderId: string,
    authorId: string,
    body: string,
    isInternal: boolean
  ): Promise<WorkNote> {
    return prisma.workNote.create({
      data: {
        organizationId,
        workOrderId,
        authorId,
        body,
        isInternal,
      },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async findNotes(
    organizationId: string,
    workOrderId: string,
    includeInternal: boolean
  ): Promise<WorkNote[]> {
    return prisma.workNote.findMany({
      where: {
        organizationId,
        workOrderId,
        ...(includeInternal ? {} : { isInternal: false }),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async createCost(
    organizationId: string,
    workOrderId: string,
    createdById: string,
    data: CreateCostInput,
    totalCost: Prisma.Decimal
  ): Promise<WorkOrderCost> {
    return prisma.workOrderCost.create({
      data: {
        organizationId,
        workOrderId,
        createdById,
        type: data.type,
        description: data.description,
        quantity: new Prisma.Decimal(data.quantity),
        unitCost: new Prisma.Decimal(data.unitCost),
        totalCost,
        laborHours: data.laborHours ? new Prisma.Decimal(data.laborHours) : null,
        currency: data.currency || 'BDT',
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async findCosts(organizationId: string, workOrderId: string): Promise<WorkOrderCost[]> {
    return prisma.workOrderCost.findMany({
      where: { organizationId, workOrderId },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async findCostById(
    organizationId: string,
    workOrderId: string,
    costId: string
  ): Promise<WorkOrderCost | null> {
    return prisma.workOrderCost.findFirst({
      where: { id: costId, workOrderId, organizationId },
    });
  }

  async updateCost(
    costId: string,
    data: Partial<CreateCostInput> & { totalCost?: Prisma.Decimal }
  ): Promise<WorkOrderCost> {
    return prisma.workOrderCost.update({
      where: { id: costId },
      data: {
        ...(data.type ? { type: data.type } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.quantity !== undefined
          ? { quantity: new Prisma.Decimal(data.quantity) }
          : {}),
        ...(data.unitCost !== undefined
          ? { unitCost: new Prisma.Decimal(data.unitCost) }
          : {}),
        ...(data.totalCost ? { totalCost: data.totalCost } : {}),
        ...(data.laborHours !== undefined
          ? {
              laborHours: data.laborHours
                ? new Prisma.Decimal(data.laborHours)
                : null,
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async deleteCost(costId: string): Promise<void> {
    await prisma.workOrderCost.delete({
      where: { id: costId },
    });
  }

  async getOrgSlaConfig(organizationId: string) {
    return prisma.slaConfig.findUnique({
      where: { organizationId },
    });
  }
}

export const workOrdersRepository = new WorkOrdersRepository();
