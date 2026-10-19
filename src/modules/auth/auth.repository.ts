import { User, Session, Organization, UserRole, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';

export class AuthRepository {
  async findUserByEmail(normalizedEmail: string): Promise<(User & { organization: Organization }) | null> {
    return prisma.user.findFirst({
      where: {
        normalizedEmail,
        isActive: true,
      },
      include: {
        organization: true,
      },
    });
  }

  async findUserById(id: string): Promise<(User & { organization: Organization }) | null> {
    return prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
      },
    });
  }

  async createOrganizationWithAdmin(data: {
    orgName: string;
    orgSlug: string;
    fullName: string;
    email: string;
    normalizedEmail: string;
    passwordHash: string;
  }): Promise<{ user: User; organization: Organization }> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const organization = await tx.organization.create({
        data: {
          name: data.orgName,
          slug: data.orgSlug,
          defaultCurrency: 'BDT',
        },
      });

      await tx.slaConfig.create({
        data: {
          organizationId: organization.id,
          criticalResponseMinutes: 15,
          highResponseMinutes: 120,
          mediumResponseMinutes: 480,
          lowResponseMinutes: 2880,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          fullName: data.fullName,
          email: data.email,
          normalizedEmail: data.normalizedEmail,
          passwordHash: data.passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
      });

      return { user, organization };
    });
  }

  async createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<Session> {
    return prisma.session.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
      },
    });
  }

  async findSessionByTokenHash(
    tokenHash: string
  ): Promise<(Session & { user: User & { organization: Organization } }) | null> {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });
  }

  async rotateSession(
    sessionId: string,
    newTokenHash: string,
    newExpiresAt: Date
  ): Promise<Session> {
    return prisma.session.update({
      where: { id: sessionId },
      data: {
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  async revokeSession(sessionId: string): Promise<Session> {
    return prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<Prisma.BatchPayload> {
    return prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.passwordResetToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findValidPasswordResetToken(tokenHash: string) {
    return prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });
  }

  async markPasswordResetTokenUsed(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: {
        usedAt: new Date(),
      },
    });
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
      },
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }
}

export const authRepository = new AuthRepository();

