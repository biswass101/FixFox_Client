import { UserRole, WorkOrderStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';

export interface TechnicianSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  skills: string[];
  activeJobCount: number;
}

export class TechniciansService {
  async listTechnicians(organizationId: string): Promise<TechnicianSummary[]> {
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
        phone: true,
        skills: true,
        assignedWorkOrders: {
          where: {
            status: {
              in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
            },
          },
          select: { id: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return technicians.map((tech) => ({
      id: tech.id,
      fullName: tech.fullName,
      email: tech.email,
      phone: tech.phone,
      skills: tech.skills,
      activeJobCount: tech.assignedWorkOrders.length,
    }));
  }
}

export const techniciansService = new TechniciansService();

