import { NotFoundError } from '@church/core';
import { church } from '@church/db';
import { eq } from 'drizzle-orm';
import type {
  Church,
  ChurchId,
  ChurchSlug,
} from '../../domain/entities/church';
import type { ChurchRepository } from '../../domain/repositories/church.repository';
import { mapChurch } from './church.mapper';
import { getClient, isValidUuid } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleChurchRepository implements ChurchRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async getById(id: ChurchId): Promise<Church> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Church not found: ${id}`);
    }
    const [row] = await getClient(this.db)
      .select()
      .from(church)
      .where(eq(church.id, id));
    if (!row) throw new NotFoundError(`Church not found: ${id}`);
    return mapChurch(row);
  }

  async getBySlug(slug: ChurchSlug): Promise<Church> {
    const [row] = await getClient(this.db)
      .select()
      .from(church)
      .where(eq(church.slug, slug));
    if (!row) throw new NotFoundError(`Church not found: ${slug}`);
    return mapChurch(row);
  }
}
