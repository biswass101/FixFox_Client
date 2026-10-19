import { Invitation, InvitationStatus, UserRole } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { env } from '../../config/env';
import { hashToken, generateOpaqueToken, createAccessToken } from '../auth/token.util';
import { hashPassword } from '../auth/password.util';
import { dispatchEmail } from '../../queues';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from '../../common/errors/app-error';
import { CreateInvitationInput, AcceptInvitationInput } from './invitations.schemas';

export class InvitationsService {
  async createInvitation(
    organizationId: string,
    invitedById: string,
    userRole: UserRole,
    input: CreateInvitationInput
  ): Promise<{ invitation: Invitation; inviteUrl: string; rawToken: string }> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can send invitations');
    }

    const normalizedEmail = input.email.toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: { organizationId, normalizedEmail },
    });

    if (existingUser) {
      throw ConflictError('A user with this email address already belongs to your organization');
    }

    await prisma.invitation.updateMany({
      where: {
        organizationId,
        normalizedEmail,
        status: InvitationStatus.PENDING,
      },
      data: { status: InvitationStatus.REVOKED },
    });

    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invitation, org, inviter] = await Promise.all([
      prisma.invitation.create({
        data: {
          organizationId,
          invitedById,
          email: input.email,
          normalizedEmail,
          role: input.role,
          tokenHash,
          expiresAt,
          status: InvitationStatus.PENDING,
        },
      }),
      prisma.organization.findUnique({ where: { id: organizationId } }),
      prisma.user.findUnique({ where: { id: invitedById } }),
    ]);

    const inviteUrl = `${env.FRONTEND_URL}/invitations/accept?token=${rawToken}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb;">You've Been Invited to Join ${org?.name || 'FixFlow'}</h2>
        <p>Hello,</p>
        <p><strong>${inviter?.fullName || 'An administrator'}</strong> has invited you to join <strong>${org?.name || 'FixFlow'}</strong> as a <strong>${input.role}</strong>.</p>
        <p style="margin: 30px 0;">
          <a href="${inviteUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Accept Invitation &amp; Create Account
          </a>
        </p>
        <p style="color: #6b7280; font-size: 13px;">This invitation will expire in 7 days.</p>
      </div>
    `;

    await dispatchEmail({
      to: input.email,
      subject: `[FixFlow] Invitation to join ${org?.name || 'FixFlow'}`,
      html,
      text: `You have been invited to join ${org?.name} as a ${input.role}. Open this link to accept: ${inviteUrl}`,
    });

    return { invitation, inviteUrl, rawToken };
  }

  async listInvitations(organizationId: string): Promise<Invitation[]> {
    return prisma.invitation.findMany({
      where: {
        organizationId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    userRole: UserRole
  ): Promise<Invitation> {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw ForbiddenError('Only managers and administrators can revoke invitations');
    }

    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, organizationId },
    });

    if (!invitation) {
      throw NotFoundError('Invitation');
    }

    return prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });
  }

  async verifyInvitation(rawToken: string) {
    const tokenHash = hashToken(rawToken);

    const invitation = await prisma.invitation.findFirst({
      where: {
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!invitation) {
      throw BadRequestError('Invalid or expired invitation token');
    }

    return {
      email: invitation.email,
      role: invitation.role,
      organization: invitation.organization,
    };
  }

  async acceptInvitation(input: AcceptInvitationInput) {
    const tokenHash = hashToken(input.token);

    const invitation = await prisma.invitation.findFirst({
      where: {
        tokenHash,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: { organization: true },
    });

    if (!invitation) {
      throw BadRequestError('Invalid or expired invitation token');
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: invitation.organizationId,
        normalizedEmail: invitation.normalizedEmail,
      },
    });

    if (existingUser) {
      throw ConflictError('A user account with this email address already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const sessionToken = generateOpaqueToken();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          fullName: input.fullName,
          passwordHash,
          role: invitation.role,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      const session = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: sessionToken.tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return { user, session };
    });

    const accessToken = createAccessToken({
      sub: result.user.id,
      orgId: result.user.organizationId,
      role: result.user.role,
      sessionId: result.session.id,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role,
        organization: {
          id: invitation.organization.id,
          name: invitation.organization.name,
          slug: invitation.organization.slug,
        },
      },
      accessToken,
      refreshToken: sessionToken.rawToken,
    };
  }
}

export const invitationsService = new InvitationsService();

