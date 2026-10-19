import {
  PrismaClient,
  UserRole,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderCategory,
  CostType,
  AIAnalysisStatus,
  NotificationType,
} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const orgSlug = 'apex-facilities';

  let org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Apex Facilities Group',
        slug: orgSlug,
        defaultCurrency: 'BDT',
      },
    });
  }

  await prisma.slaConfig.upsert({
    where: { organizationId: org.id },
    create: {
      organizationId: org.id,
      criticalResponseMinutes: 15,
      highResponseMinutes: 120,
      mediumResponseMinutes: 480,
      lowResponseMinutes: 2880,
    },
    update: {},
  });

  const passwordHash = await argon2.hash('Password123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const createOrGetUser = async (
    email: string,
    fullName: string,
    role: UserRole,
    skills: string[] = []
  ) => {
    const normalizedEmail = email.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { organizationId: org.id, normalizedEmail },
    });

    if (existing) return existing;

    return prisma.user.create({
      data: {
        organizationId: org.id,
        email: normalizedEmail,
        normalizedEmail,
        fullName,
        passwordHash,
        role,
        skills,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
  };

  const admin = await createOrGetUser('admin@apex.fixflow.app', 'Alex Rivera', UserRole.ADMIN);
  const manager = await createOrGetUser('manager@apex.fixflow.app', 'Morgan Davis', UserRole.MANAGER);
  const techHvac = await createOrGetUser(
    'tech.hvac@apex.fixflow.app',
    'Jordan Lee',
    UserRole.TECHNICIAN,
    ['HVAC', 'Plumbing', 'Refrigeration']
  );
  const techElec = await createOrGetUser(
    'tech.elec@apex.fixflow.app',
    'Samir Khan',
    UserRole.TECHNICIAN,
    ['Electrical', 'Elevator', 'Safety']
  );
  const reporter = await createOrGetUser('reporter@apex.fixflow.app', 'Casey Taylor', UserRole.REPORTER);

  const locDatacenter = await prisma.location.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Central Datacenter' } },
    create: {
      organizationId: org.id,
      name: 'Central Datacenter',
      building: 'Building A',
      floor: 'Level 2',
      room: 'Suite 201',
      description: 'Primary server room and telecommunications hub',
    },
    update: {},
  });

  const locRooftop = await prisma.location.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Rooftop Plant Room' } },
    create: {
      organizationId: org.id,
      name: 'Rooftop Plant Room',
      building: 'Building A',
      floor: 'Roof Level',
      description: 'Chillers, cooling towers, and air handlers',
    },
    update: {},
  });

  const locLobby = await prisma.location.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Corporate Tower Lobby' } },
    create: {
      organizationId: org.id,
      name: 'Corporate Tower Lobby',
      building: 'Main Tower',
      floor: 'Ground Floor',
    },
    update: {},
  });

  const assetChiller = await prisma.asset.upsert({
    where: { organizationId_assetCode: { organizationId: org.id, assetCode: 'HVAC-CHILLER-01' } },
    create: {
      organizationId: org.id,
      locationId: locRooftop.id,
      assetCode: 'HVAC-CHILLER-01',
      name: 'Trane Centrifugal Chiller Alpha',
      category: 'HVAC',
      manufacturer: 'Trane',
      modelNumber: 'CTV-500',
    },
    update: {},
  });

  const assetElevator = await prisma.asset.upsert({
    where: { organizationId_assetCode: { organizationId: org.id, assetCode: 'ELEV-PASS-01' } },
    create: {
      organizationId: org.id,
      locationId: locLobby.id,
      assetCode: 'ELEV-PASS-01',
      name: 'Otis SkyRise Passenger Elevator 1',
      category: 'ELEVATOR',
      manufacturer: 'Otis',
    },
    update: {},
  });

  const existingOrdersCount = await prisma.workOrder.count({
    where: { organizationId: org.id },
  });

  if (existingOrdersCount === 0) {
    const wo1 = await prisma.workOrder.create({
      data: {
        organizationId: org.id,
        reporterId: reporter.id,
        locationId: locDatacenter.id,
        assetId: assetChiller.id,
        title: 'Server Room Chiller Low Pressure Warning',
        description: 'Chiller refrigerant pressure dropped below 45 PSI. Temperature in datacenter rising.',
        category: WorkOrderCategory.HVAC,
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.OPEN,
        dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    await prisma.workOrderAIAnalysis.create({
      data: {
        organizationId: org.id,
        workOrderId: wo1.id,
        model: 'openai/gpt-4o-mini',
        status: AIAnalysisStatus.COMPLETED,
        suggestedCategory: WorkOrderCategory.HVAC,
        suggestedPriority: WorkOrderPriority.HIGH,
        summary: 'Refrigerant pressure drop on primary datacenter chiller posing thermal risk.',
        safetyFlags: ['Equipment Overheating Risk'],
        rationale: 'Server room cooling failure directly threatens hardware integrity.',
        confidence: 0.95,
      },
    });

    const wo2 = await prisma.workOrder.create({
      data: {
        organizationId: org.id,
        reporterId: reporter.id,
        assigneeId: techElec.id,
        locationId: locLobby.id,
        assetId: assetElevator.id,
        title: 'Elevator 1 Optical Door Sensor Misaligned',
        description: 'Elevator doors reopening repeatedly on ground floor.',
        category: WorkOrderCategory.ELEVATOR,
        priority: WorkOrderPriority.HIGH,
        status: WorkOrderStatus.ASSIGNED,
        assignedAt: new Date(),
        dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      },
    });

    await prisma.workOrderAssignment.create({
      data: {
        organizationId: org.id,
        workOrderId: wo2.id,
        technicianId: techElec.id,
        assignedById: manager.id,
        reason: 'Lead elevator & electrical technician dispatch',
      },
    });

    const wo3 = await prisma.workOrder.create({
      data: {
        organizationId: org.id,
        reporterId: reporter.id,
        assigneeId: techHvac.id,
        locationId: locRooftop.id,
        title: 'Rooftop Water Supply Pipe Joint Seepage',
        description: 'Minor steady dripping detected on flange connection.',
        category: WorkOrderCategory.PLUMBING,
        priority: WorkOrderPriority.MEDIUM,
        status: WorkOrderStatus.IN_PROGRESS,
        assignedAt: new Date(Date.now() - 3 * 3600000),
        startedAt: new Date(Date.now() - 2 * 3600000),
        dueAt: new Date(Date.now() + 6 * 3600000),
      },
    });

    await prisma.workNote.create({
      data: {
        organizationId: org.id,
        workOrderId: wo3.id,
        authorId: techHvac.id,
        body: 'Isolated section isolation valve. Gasket replacement in progress.',
        isInternal: true,
      },
    });

    const wo4 = await prisma.workOrder.create({
      data: {
        organizationId: org.id,
        reporterId: reporter.id,
        assigneeId: techElec.id,
        locationId: locDatacenter.id,
        title: 'Datacenter Emergency Exit Luminaire Replaced',
        description: 'Exit sign luminaire battery test failure during monthly audit.',
        category: WorkOrderCategory.FIRE_SAFETY,
        priority: WorkOrderPriority.MEDIUM,
        status: WorkOrderStatus.RESOLVED,
        assignedAt: new Date(Date.now() - 24 * 3600000),
        startedAt: new Date(Date.now() - 20 * 3600000),
        resolvedAt: new Date(Date.now() - 2 * 3600000),
        resolutionSummary: 'Installed new compliant 3-hour emergency LED luminaire and verified test switch.',
      },
    });

    await prisma.workOrderCost.create({
      data: {
        organizationId: org.id,
        workOrderId: wo4.id,
        createdById: techElec.id,
        type: CostType.PARTS,
        description: 'Emergency Exit LED Luminaire Kit',
        quantity: 1,
        unitCost: 120.0,
        totalCost: 120.0,
      },
    });

    await prisma.workOrder.create({
      data: {
        organizationId: org.id,
        reporterId: manager.id,
        assigneeId: techHvac.id,
        locationId: locRooftop.id,
        title: 'Quarterly Air Filter Replacements Complete',
        description: 'Routine scheduled replacement of intake pre-filters across rooftop units.',
        category: WorkOrderCategory.HVAC,
        priority: WorkOrderPriority.LOW,
        status: WorkOrderStatus.CLOSED,
        assignedAt: new Date(Date.now() - 48 * 3600000),
        startedAt: new Date(Date.now() - 40 * 3600000),
        resolvedAt: new Date(Date.now() - 36 * 3600000),
        closedAt: new Date(Date.now() - 30 * 3600000),
        resolutionSummary: 'All 8 filters replaced with MERV-13 units.',
      },
    });

    await prisma.notification.create({
      data: {
        organizationId: org.id,
        recipientId: manager.id,
        type: NotificationType.WORK_ORDER_ASSIGNED,
        title: 'New Maintenance Work Order Created',
        body: 'Server Room Chiller Low Pressure Warning created by Casey Taylor.',
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

