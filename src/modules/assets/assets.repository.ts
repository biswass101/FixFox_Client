import { Asset, Location, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { CreateAssetInput, UpdateAssetInput, AssetQueryParams } from './assets.schemas';

export class AssetsRepository {
  async create(organizationId: string, data: CreateAssetInput): Promise<Asset & { location: Location }> {
    return prisma.asset.create({
      data: {
        organizationId,
        locationId: data.locationId,
        assetCode: data.assetCode,
        name: data.name,
        category: data.category,
        manufacturer: data.manufacturer,
        modelNumber: data.modelNumber,
        serialNumber: data.serialNumber,
        purchaseDate: data.purchaseDate,
        warrantyExpiresAt: data.warrantyExpiresAt,
        condition: data.condition,
      },
      include: {
        location: true,
      },
    });
  }

  async findById(
    organizationId: string,
    id: string
  ): Promise<(Asset & { location: Location }) | null> {
    return prisma.asset.findFirst({
      where: { id, organizationId },
      include: { location: true },
    });
  }

  async findByCode(organizationId: string, assetCode: string): Promise<Asset | null> {
    return prisma.asset.findFirst({
      where: {
        organizationId,
        assetCode: { equals: assetCode, mode: 'insensitive' },
      },
    });
  }

  async findMany(
    organizationId: string,
    params: AssetQueryParams
  ): Promise<{ items: (Asset & { location: Location })[]; total: number }> {
    const where: Prisma.AssetWhereInput = {
      organizationId,
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.locationId ? { locationId: params.locationId } : {}),
      ...(params.category ? { category: { equals: params.category, mode: 'insensitive' } } : {}),
      ...(params.condition ? { condition: params.condition } : {}),
      ...(params.search
        ? {
            OR: [
              { assetCode: { contains: params.search, mode: 'insensitive' } },
              { name: { contains: params.search, mode: 'insensitive' } },
              { manufacturer: { contains: params.search, mode: 'insensitive' } },
              { modelNumber: { contains: params.search, mode: 'insensitive' } },
              { serialNumber: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (params.page - 1) * params.limit;

    const [items, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take: params.limit,
        include: { location: true },
        orderBy: { name: 'asc' },
      }),
      prisma.asset.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateAssetInput
  ): Promise<Asset & { location: Location }> {
    return prisma.asset.update({
      where: { id, organizationId },
      data,
      include: { location: true },
    });
  }

  async delete(organizationId: string, id: string): Promise<Asset> {
    return prisma.asset.update({
      where: { id, organizationId },
      data: { isActive: false },
    });
  }
}

export const assetsRepository = new AssetsRepository();

