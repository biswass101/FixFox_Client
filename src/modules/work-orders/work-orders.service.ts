import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  UserRole,
  Prisma,
  WorkNote,
  WorkOrderCost,
  AIAnalysisStatus,
} from '@prisma/client';
import { dispatchAITriage } from '../../queues';
import { workOrdersRepository, WorkOrdersRepository } from './work-orders.repository';
import { locationsRepository, LocationsRepository } from '../locations/locations.repository';
import { assetsRepository, AssetsRepository } from '../assets/assets.repository';
import { prisma } from '../../database/prisma';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  isValidTransition,
  canUserTransitionStatus,
} from './work-orders.state-machine';
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderQueryParams,
  AssignTechnicianInput,
  UpdateStatusInput,
  ResolveWorkOrderInput,
  ReopenWorkOrderInput,
  CreateNoteInput,
  CreateCostInput,
  UpdateCostInput,
} from './work-orders.schemas';

export class WorkOrdersService {
  constructor(
    private readonly repo: WorkOrdersRepository = workOrdersRepository,
    private readonly locRepo: LocationsRepository = locationsRepository,
    private readonly assetRepo: AssetsRepository = assetsRepository
  ) {}

  async create(
    organizationId: string,
    reporterId: string,
    input: CreateWorkOrderInput
  ): Promise<WorkOrder> {
    const location = await this.locRepo.findById(organizationId, input.locationId);
    if (!location) {
      throw BadRequestError('Location not found in your organization');
    }

    if (input.assetId) {
      const asset = await this.assetRepo.findById(organizationId, input.assetId);
      if (!asset) {
        throw BadRequestError('Asset not found in your organization');
      }
    }

    const dueAt = await this.calculateDueAt(organizationId, input.priority);
    const workOrder = await this.repo.create(organizationId, reporterId, input, dueAt);

    await prisma.workOrderAIAnalysis
      .create({
        data: {
          workOrderId: workOrder.id,
          organizationId,
          model: 'pending-openrouter',
          status: AIAnalysisStatus.PENDING,
        },
      })
      .catch(() => {});

    await dispatchAITriage({
      workOrderId: workOrder.id,
      organizationId,
    });

    return workOrder;
  }

  async getById(
    organizationId: string,
    id: string,
    viewerRole: UserRole,
    viewerId: string
  ) {
    const isReporter = viewerRole === UserRole.REPORTER;
    const workOrder = await this.repo.findById(organizationId, id, !isReporter);

    if (!workOrder) {
      throw NotFoundError('Work order');
    }

    if (isReporter && workOrder.reporterId !== viewerId) {
      throw NotFoundError('Work order');
    }

    return workOrder;
  }

  async list(
    organizationId: string,
    params: WorkOrderQueryParams,
    viewerRole: UserRole,
    viewerId: string
  ) {
    return this.repo.findMany(organizationId, params, viewerRole, viewerId);
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateWorkOrderInput,
    viewerRole: UserRole
  ): Promise<WorkOrder> {
    if (viewerRole !== UserRole.ADMIN && viewerRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can update work orders');
    }

    const existing = await this.repo.findById(organizationId, id, true);
    if (!existing) {
      throw NotFoundError('Work order');
    }

    if (input.locationId) {
      const location = await this.locRepo.findById(organizationId, input.locationId);
      if (!location) {
        throw BadRequestError('Location not found in your organization');
      }
    }

    if (input.assetId) {
      const asset = await this.assetRepo.findById(organizationId, input.assetId);
      if (!asset) {
        throw BadRequestError('Asset not found in your organization');
      }
    }

    let newDueAt: Date | undefined;
    if (input.priority && input.priority !== existing.priority) {
      newDueAt = (await this.calculateDueAt(organizationId, input.priority)) ?? undefined;
    }

    const updateData: Prisma.WorkOrderUpdateInput = {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.locationId ? { location: { connect: { id: input.locationId } } } : {}),
      ...(input.assetId !== undefined
        ? input.assetId === null
          ? { asset: { disconnect: true } }
          : { asset: { connect: { id: input.assetId } } }
        : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(newDueAt ? { dueAt: newDueAt } : {}),
    };

    const updated = await this.repo.updateOptimistic(
      organizationId,
      id,
      input.version,
      updateData
    );

    if (!updated) {
      throw ConflictError(
        'Work order was modified by another user. Please refresh and try again.'
      );
    }

    return updated;
  }

  async assignTechnician(
    organizationId: string,
    workOrderId: string,
    input: AssignTechnicianInput,
    assignedById: string,
    userRole: UserRole
  ): Promise<WorkOrder> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can assign technicians');
    }

    const technician = await prisma.user.findFirst({
      where: {
        id: input.technicianId,
        organizationId,
        role: UserRole.TECHNICIAN,
        isActive: true,
      },
    });

    if (!technician) {
      throw BadRequestError('Assigned user must be an active technician in your organization');
    }

    return this.repo.assignTechnician(
      organizationId,
      workOrderId,
      input.technicianId,
      assignedById,
      input.reason
    );
  }

  async updateStatus(
    organizationId: string,
    workOrderId: string,
    input: UpdateStatusInput,
    userId: string,
    userRole: UserRole
  ): Promise<WorkOrder> {
    const current = await this.repo.findById(organizationId, workOrderId, true);
    if (!current) {
      throw NotFoundError('Work order');
    }

    if (input.version && current.version !== input.version) {
      throw ConflictError(
        'Work order was modified by another user. Please refresh and try again.'
      );
    }

    if (current.status === input.status) {
      return current;
    }

    if (!isValidTransition(current.status, input.status)) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Cannot transition work order from ${current.status} to ${input.status}`
      );
    }

    const isAssignee = current.assigneeId === userId;
    if (!canUserTransitionStatus(userRole, isAssignee, input.status)) {
      throw ForbiddenError(
        `You do not have permission to transition this work order to ${input.status}`
      );
    }

    const extraData: { startedAt?: Date } = {};
    if (
      input.status === WorkOrderStatus.IN_PROGRESS &&
      !current.startedAt
    ) {
      extraData.startedAt = new Date();
    }

    return this.repo.updateStatus(
      organizationId,
      workOrderId,
      userId,
      input.status,
      input.reason,
      extraData
    );
  }

  async resolveWorkOrder(
    organizationId: string,
    workOrderId: string,
    input: ResolveWorkOrderInput,
    userId: string,
    userRole: UserRole
  ): Promise<WorkOrder> {
    const current = await this.repo.findById(organizationId, workOrderId, true);
    if (!current) {
      throw NotFoundError('Work order');
    }

    if (!isValidTransition(current.status, WorkOrderStatus.RESOLVED)) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Work order cannot be resolved from status ${current.status}. It must be IN_PROGRESS.`
      );
    }

    const isAssignee = current.assigneeId === userId;
    if (!canUserTransitionStatus(userRole, isAssignee, WorkOrderStatus.RESOLVED)) {
      throw ForbiddenError('You do not have permission to resolve this work order');
    }

    return this.repo.updateStatus(
      organizationId,
      workOrderId,
      userId,
      WorkOrderStatus.RESOLVED,
      'Work order marked as resolved',
      {
        resolvedAt: new Date(),
        resolutionSummary: input.resolutionSummary,
      }
    );
  }

  async closeWorkOrder(
    organizationId: string,
    workOrderId: string,
    userId: string,
    userRole: UserRole
  ): Promise<WorkOrder> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can close work orders');
    }

    const current = await this.repo.findById(organizationId, workOrderId, true);
    if (!current) {
      throw NotFoundError('Work order');
    }

    if (!isValidTransition(current.status, WorkOrderStatus.CLOSED)) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Work order must be RESOLVED before it can be closed. Current status: ${current.status}`
      );
    }

    return this.repo.updateStatus(
      organizationId,
      workOrderId,
      userId,
      WorkOrderStatus.CLOSED,
      'Work order closed',
      {
        closedAt: new Date(),
      }
    );
  }

  async reopenWorkOrder(
    organizationId: string,
    workOrderId: string,
    input: ReopenWorkOrderInput,
    userId: string,
    userRole: UserRole
  ): Promise<WorkOrder> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can reopen work orders');
    }

    const current = await this.repo.findById(organizationId, workOrderId, true);
    if (!current) {
      throw NotFoundError('Work order');
    }

    if (!isValidTransition(current.status, WorkOrderStatus.IN_PROGRESS)) {
      throw new AppError(
        400,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Work order cannot be reopened from status ${current.status}`
      );
    }

    return this.repo.updateStatus(
      organizationId,
      workOrderId,
      userId,
      WorkOrderStatus.IN_PROGRESS,
      `Reopened: ${input.reason}`
    );
  }

  async addNote(
    organizationId: string,
    workOrderId: string,
    input: CreateNoteInput,
    authorId: string,
    authorRole: UserRole
  ): Promise<WorkNote> {
    const current = await this.repo.findById(organizationId, workOrderId, true);
    if (!current) {
      throw NotFoundError('Work order');
    }

    const isInternal = authorRole === UserRole.REPORTER ? false : input.isInternal;

    return this.repo.createNote(
      organizationId,
      workOrderId,
      authorId,
      input.body,
      isInternal
    );
  }

  async listNotes(
    organizationId: string,
    workOrderId: string,
    viewerRole: UserRole,
    viewerId: string
  ): Promise<WorkNote[]> {
    await this.getById(organizationId, workOrderId, viewerRole, viewerId);
    return this.repo.findNotes(
      organizationId,
      workOrderId,
      viewerRole !== UserRole.REPORTER
    );
  }

  async addCost(
    organizationId: string,
    workOrderId: string,
    input: CreateCostInput,
    createdById: string,
    userRole: UserRole
  ): Promise<WorkOrderCost> {
    const current = await this.repo.findById(organizationId, workOrderId, true);
    if (!current) {
      throw NotFoundError('Work order');
    }

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      current.assigneeId !== createdById
    ) {
      throw ForbiddenError('You do not have permission to record costs for this work order');
    }

    const totalCost = new Prisma.Decimal(input.quantity).mul(
      new Prisma.Decimal(input.unitCost)
    );

    return this.repo.createCost(
      organizationId,
      workOrderId,
      createdById,
      input,
      totalCost
    );
  }

  async listCosts(
    organizationId: string,
    workOrderId: string,
    viewerRole: UserRole,
    viewerId: string
  ): Promise<{ costs: WorkOrderCost[]; totalCost: string }> {
    await this.getById(organizationId, workOrderId, viewerRole, viewerId);
    const costs = await this.repo.findCosts(organizationId, workOrderId);

    const sum = costs.reduce((acc, cost) => acc.add(cost.totalCost), new Prisma.Decimal(0));

    return {
      costs,
      totalCost: sum.toFixed(2),
    };
  }

  async updateCost(
    organizationId: string,
    workOrderId: string,
    costId: string,
    input: UpdateCostInput,
    userId: string,
    userRole: UserRole
  ): Promise<WorkOrderCost> {
    const cost = await this.repo.findCostById(organizationId, workOrderId, costId);
    if (!cost) {
      throw NotFoundError('Cost entry');
    }

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      cost.createdById !== userId
    ) {
      throw ForbiddenError('You do not have permission to modify this cost entry');
    }

    const quantity = input.quantity !== undefined ? input.quantity : Number(cost.quantity);
    const unitCost = input.unitCost !== undefined ? input.unitCost : Number(cost.unitCost);
    const totalCost = new Prisma.Decimal(quantity).mul(new Prisma.Decimal(unitCost));

    return this.repo.updateCost(costId, {
      ...input,
      totalCost,
    });
  }

  async deleteCost(
    organizationId: string,
    workOrderId: string,
    costId: string,
    userRole: UserRole
  ): Promise<void> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can delete cost entries');
    }

    const cost = await this.repo.findCostById(organizationId, workOrderId, costId);
    if (!cost) {
      throw NotFoundError('Cost entry');
    }

    await this.repo.deleteCost(costId);
  }

  private async calculateDueAt(
    organizationId: string,
    priority: WorkOrderPriority
  ): Promise<Date | null> {
    const sla = await this.repo.getOrgSlaConfig(organizationId);

    const minutesMap: Record<WorkOrderPriority, number> = {
      [WorkOrderPriority.CRITICAL]: sla?.criticalResponseMinutes ?? 15,
      [WorkOrderPriority.HIGH]: sla?.highResponseMinutes ?? 120,
      [WorkOrderPriority.MEDIUM]: sla?.mediumResponseMinutes ?? 480,
      [WorkOrderPriority.LOW]: sla?.lowResponseMinutes ?? 2880,
    };

    const targetMinutes = minutesMap[priority] || 480;
    return new Date(Date.now() + targetMinutes * 60 * 1000);
  }
}

export const workOrdersService = new WorkOrdersService();

