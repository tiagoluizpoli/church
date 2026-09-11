import { NotFoundError } from '@church/core';
import { church, member, organization, user } from '@church/db';
import { and, eq } from 'drizzle-orm';
import type {
  ChurchRepository,
  GetChurchByIdInput,
  GetChurchBySlugInput,
  ListChurchAdminEmailsInput,
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

  /**
   * Church-wide administration has no domain table of its own — it's read
   * from Better Auth's `member.role = 'admin'` for the organization whose id
   * equals the Church id (spec §4.5).
   */
  async listAdminEmails({ id }: ListChurchAdminEmailsInput): Promise<string[]> {
    const rows = await getClient(this.db)
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, id), eq(member.role, 'admin')));
    return rows.map((row) => row.email);
  }
}
