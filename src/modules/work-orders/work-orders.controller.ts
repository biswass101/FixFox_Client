import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { workOrdersService, WorkOrdersService } from './work-orders.service';
import {
  sendCreated,
  sendSuccess,
  sendPaginated,
  sendNoContent,
  createPaginationMeta,
} from '../../common/utils/api-response';

export class WorkOrdersController {
  constructor(private readonly service: WorkOrdersService = workOrdersService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.create(
      req.user!.organizationId,
      req.user!.userId,
      req.body
    );
    sendCreated(res, workOrder);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.getById(
      req.user!.organizationId,
      req.params.id,
      req.user!.role as UserRole,
      req.user!.userId
    );
    sendSuccess(res, workOrder);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, total } = await this.service.list(
      req.user!.organizationId,
      req.query as any,
      req.user!.role as UserRole,
      req.user!.userId
    );
    const pagination = createPaginationMeta(
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20,
      total
    );
    sendPaginated(res, items, pagination);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.update(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.role as UserRole
    );
    sendSuccess(res, workOrder);
  };

  assign = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.assignTechnician(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, workOrder);
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.updateStatus(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, workOrder);
  };

  resolve = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.resolveWorkOrder(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, workOrder);
  };

  close = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.closeWorkOrder(
      req.user!.organizationId,
      req.params.id,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, workOrder);
  };

  reopen = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.reopenWorkOrder(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, workOrder);
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.cancelWorkOrder(
      req.user!.organizationId,
      req.params.id,
      req.user!.userId,
      req.user!.role as UserRole,
      req.body?.reason
    );
    sendSuccess(res, workOrder);
  };

  getHistory = async (req: Request, res: Response): Promise<void> => {
    const workOrder = await this.service.getById(
      req.user!.organizationId,
      req.params.id,
      req.user!.role as UserRole,
      req.user!.userId
    );
    sendSuccess(res, workOrder.statusHistory);
  };

  addNote = async (req: Request, res: Response): Promise<void> => {
    const note = await this.service.addNote(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendCreated(res, note);
  };

  listNotes = async (req: Request, res: Response): Promise<void> => {
    const notes = await this.service.listNotes(
      req.user!.organizationId,
      req.params.id,
      req.user!.role as UserRole,
      req.user!.userId
    );
    sendSuccess(res, notes);
  };

  addCost = async (req: Request, res: Response): Promise<void> => {
    const cost = await this.service.addCost(
      req.user!.organizationId,
      req.params.id,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendCreated(res, cost);
  };

  listCosts = async (req: Request, res: Response): Promise<void> => {
    const data = await this.service.listCosts(
      req.user!.organizationId,
      req.params.id,
      req.user!.role as UserRole,
      req.user!.userId
    );
    sendSuccess(res, data);
  };

  updateCost = async (req: Request, res: Response): Promise<void> => {
    const cost = await this.service.updateCost(
      req.user!.organizationId,
      req.params.id,
      req.params.costId,
      req.body,
      req.user!.userId,
      req.user!.role as UserRole
    );
    sendSuccess(res, cost);
  };

  deleteCost = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteCost(
      req.user!.organizationId,
      req.params.id,
      req.params.costId,
      req.user!.role as UserRole
    );
    sendNoContent(res);
  };
}

export const workOrdersController = new WorkOrdersController();

