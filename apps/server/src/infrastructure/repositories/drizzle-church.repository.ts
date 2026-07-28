import { NotFoundError } from '@church/core';
import { church, organization } from '@church/db';
import { eq } from 'drizzle-orm';
import type {
  ChurchRepository,
  GetChurchByIdInput,
  GetChurchBySlugInput,
} from '../../domain/contracts/infrastructure/church.repository';
import type { Church } from '../../domain/entities/church';
import { mapChurch } from '../mappers/church.mapper';
import { getClient, isValidUuid } from './helpers';
import type { AnyDrizzleDb } from './types';

// Church identity lives on the `organization` row and the rest on the `church`
// extension row keyed by the same id, so every read joins the two.
const churchJoinShape = { church, organization };

interface DrizzleChurchRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleChurchRepository implements ChurchRepository {
  constructor({ db }: DrizzleChurchRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async getById({ id }: GetChurchByIdInput): Promise<Church> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Church not found: ${id}`);
    }
    const [row] = await getClient(this.db)
      .select(churchJoinShape)
      .from(church)
      .innerJoin(organization, eq(organization.id, church.id))
      .where(eq(church.id, id));
    if (!row) throw new NotFoundError(`Church not found: ${id}`);
    return mapChurch(row);
  }

  async getBySlug({ slug }: GetChurchBySlugInput): Promise<Church> {
    const [row] = await getClient(this.db)
      .select(churchJoinShape)
      .from(church)
      .innerJoin(organization, eq(organization.id, church.id))
      .where(eq(organization.slug, slug));
    if (!row) throw new NotFoundError(`Church not found: ${slug}`);
    return mapChurch(row);
  }
}
