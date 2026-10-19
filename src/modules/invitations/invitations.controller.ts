import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { invitationsService, InvitationsService } from './invitations.service';
import { sendCreated, sendSuccess } from '../../common/utils/api-response';

export class InvitationsController {
  constructor(private readonly service: InvitationsService = invitationsService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.createInvitation(
      req.user!.organizationId,
      req.user!.userId,
      req.user!.role as UserRole,
      req.body
    );
    sendCreated(res, result);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const invitations = await this.service.listInvitations(req.user!.organizationId);
    sendSuccess(res, invitations);
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    const invitation = await this.service.revokeInvitation(
      req.user!.organizationId,
      req.params.id,
      req.user!.role as UserRole
    );
    sendSuccess(res, invitation);
  };

  verify = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.verifyInvitation(req.params.token);
    sendSuccess(res, result);
  };

  accept = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.acceptInvitation(req.body);
    sendSuccess(res, result);
  };
}

export const invitationsController = new InvitationsController();

