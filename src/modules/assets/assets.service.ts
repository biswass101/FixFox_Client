import { Asset, Location } from '@prisma/client';
import { assetsRepository, AssetsRepository } from './assets.repository';
import { locationsRepository, LocationsRepository } from '../locations/locations.repository';
import { ConflictError, NotFoundError, BadRequestError } from '../../common/errors/app-error';
import type { CreateAssetInput, UpdateAssetInput, AssetQueryParams } from './assets.schemas';

export class AssetsService {
  constructor(
    private readonly repo: AssetsRepository = assetsRepository,
    private readonly locRepo: LocationsRepository = locationsRepository
  ) {}

  async create(
    organizationId: string,
    input: CreateAssetInput
  ): Promise<Asset & { location: Location }> {
    const location = await this.locRepo.findById(organizationId, input.locationId);
    if (!location) {
      throw BadRequestError('Location not found in your organization');
    }

    const existing = await this.repo.findByCode(organizationId, input.assetCode);
    if (existing) {
      throw ConflictError(`An asset with code "${input.assetCode}" already exists in your organization`);
    }

    return this.repo.create(organizationId, input);
  }

  async getById(
    organizationId: string,
    id: string
  ): Promise<Asset & { location: Location }> {
    const asset = await this.repo.findById(organizationId, id);
    if (!asset) {
      throw NotFoundError('Asset');
    }
    return asset;
  }

  async list(
    organizationId: string,
    params: AssetQueryParams
  ): Promise<{ items: (Asset & { location: Location })[]; total: number }> {
    return this.repo.findMany(organizationId, params);
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateAssetInput
  ): Promise<Asset & { location: Location }> {
    await this.getById(organizationId, id);

    if (input.locationId) {
      const location = await this.locRepo.findById(organizationId, input.locationId);
      if (!location) {
        throw BadRequestError('Location not found in your organization');
      }
    }

    if (input.assetCode) {
      const existing = await this.repo.findByCode(organizationId, input.assetCode);
      if (existing && existing.id !== id) {
        throw ConflictError(`An asset with code "${input.assetCode}" already exists`);
      }
    }

    return this.repo.update(organizationId, id, input);
  }

  async delete(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await this.repo.delete(organizationId, id);
  }
}

export const assetsService = new AssetsService();

