import { Location } from '@prisma/client';
import { locationsRepository, LocationsRepository } from './locations.repository';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';
import type { CreateLocationInput, UpdateLocationInput, LocationQueryParams } from './locations.schemas';

export class LocationsService {
  constructor(private readonly repo: LocationsRepository = locationsRepository) {}

  async create(organizationId: string, input: CreateLocationInput): Promise<Location> {
    const existing = await this.repo.findByName(organizationId, input.name);
    if (existing) {
      throw ConflictError(`A location named "${input.name}" already exists`);
    }
    return this.repo.create(organizationId, input);
  }

  async getById(organizationId: string, id: string): Promise<Location> {
    const location = await this.repo.findById(organizationId, id);
    if (!location) {
      throw NotFoundError('Location');
    }
    return location;
  }

  async list(
    organizationId: string,
    params: LocationQueryParams
  ): Promise<{ items: Location[]; total: number }> {
    return this.repo.findMany(organizationId, params);
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateLocationInput
  ): Promise<Location> {
    await this.getById(organizationId, id);

    if (input.name) {
      const existing = await this.repo.findByName(organizationId, input.name);
      if (existing && existing.id !== id) {
        throw ConflictError(`A location named "${input.name}" already exists`);
      }
    }

    return this.repo.update(organizationId, id, input);
  }

  async delete(organizationId: string, id: string): Promise<void> {
    await this.getById(organizationId, id);
    await this.repo.delete(organizationId, id);
  }
}

export const locationsService = new LocationsService();

