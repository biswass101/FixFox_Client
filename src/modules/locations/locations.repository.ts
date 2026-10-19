import { Location, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { CreateLocationInput, UpdateLocationInput, LocationQueryParams } from './locations.schemas';

export class LocationsRepository {
  async create(organizationId: string, data: CreateLocationInput): Promise<Location> {
    return prisma.location.create({
      data: {
        organizationId,
        name: data.name,
        building: data.building,
        floor: data.floor,
        room: data.room,
        description: data.description,
      },
    });
  }

  async findById(organizationId: string, id: string): Promise<Location | null> {
    return prisma.location.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  async findByName(organizationId: string, name: string): Promise<Location | null> {
    return prisma.location.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
  }

  async findMany(
    organizationId: string,
    params: LocationQueryParams
  ): Promise<{ items: Location[]; total: number }> {
    const where: Prisma.LocationWhereInput = {
      organizationId,
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.building ? { building: { contains: params.building, mode: 'insensitive' } } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { building: { contains: params.search, mode: 'insensitive' } },
              { room: { contains: params.search, mode: 'insensitive' } },
              { description: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      prisma.location.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { name: 'asc' },
      }),
      prisma.location.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateLocationInput
  ): Promise<Location> {
    return prisma.location.update({
      where: { id, organizationId },
      data,
    });
  }

  async delete(organizationId: string, id: string): Promise<Location> {
    return prisma.location.update({
      where: { id, organizationId },
      data: { isActive: false },
    });
  }
}

export const locationsRepository = new LocationsRepository();

