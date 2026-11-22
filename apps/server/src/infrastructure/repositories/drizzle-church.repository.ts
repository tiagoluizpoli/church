import { NotFoundError } from '@church/core';
import {
  church,
  churchSlugHistory,
  member,
  organization,
  user,
} from '@church/db';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { UserId } from '../../domain/branded-ids';
import type {
  ChurchSettings,
  ChurchSlugAvailability,
} from '../../domain/church-settings';
import type {
  ChurchMemberContact,
  ChurchRepository,
  FindChurchMemberEmailInput,
  FindUserNameInput,
  GetChurchByIdInput,
  GetChurchBySlugInput,
  ListChurchAdminUserIdsInput,
  SaveChurchLogoKeyInput,
  SaveChurchSettingsInput,
  SlugAvailabilityInput,
} from '../../domain/contracts/infrastructure/church.repository';
import type { Church } from '../../domain/entities/church';
import { ChurchSlugTakenError } from '../../domain/errors/church-slug-taken';
import { mapChurch } from '../mappers/church.mapper';
import { getClient, isValidUuid } from './helpers';
import type { AnyDrizzleDb } from './types';

// Church identity lives on the `organization` row and the rest on the `church`
// extension row keyed by the same id, so every read joins the two.
const churchJoinShape = { church, organization };

type DrizzleClient = ReturnType<typeof getClient>;

interface FindSlugAvailabilityInput {
  client: DrizzleClient;
  id: string;
  slug: string;
}

type ChangeSlugInput = FindSlugAvailabilityInput;

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
    const [row] = await getClient({ db: this.db })
      .select(churchJoinShape)
      .from(church)
      .innerJoin(organization, eq(organization.id, church.id))
      .where(eq(church.id, id));
    if (!row) throw new NotFoundError(`Church not found: ${id}`);
    return mapChurch(row);
  }

  async getBySlug({ slug }: GetChurchBySlugInput): Promise<Church> {
    const [row] = await getClient({ db: this.db })
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
  async listAdminUserIds({
    id,
    tx,
  }: ListChurchAdminUserIdsInput): Promise<UserId[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, id), eq(member.role, 'admin')))
      .orderBy(asc(member.userId));
    return rows.map((row) => row.userId as UserId);
  }

  async findMemberEmail({
    id,
    userId,
  }: FindChurchMemberEmailInput): Promise<string | null> {
    const [row] = await getClient({ db: this.db })
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, id), eq(member.userId, userId)));
    return row?.email ?? null;
  }

  async findMemberContact({
    id,
    userId,
  }: FindChurchMemberEmailInput): Promise<ChurchMemberContact | null> {
    const [row] = await getClient({ db: this.db })
      .select({ email: user.email, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, id), eq(member.userId, userId)));
    return row ?? null;
  }

  async findUserName({ userId }: FindUserNameInput): Promise<string | null> {
    const [row] = await getClient({ db: this.db })
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId));
    return row?.name.trim() || null;
  }

  async getSettings({ id }: GetChurchByIdInput): Promise<ChurchSettings> {
    const [row] = isValidUuid(id)
      ? await getClient({ db: this.db })
          .select({
            name: organization.name,
            slug: organization.slug,
            website: church.website,
            accentColor: church.accentColor,
            logoKey: church.logoKey,
          })
          .from(church)
          .innerJoin(organization, eq(organization.id, church.id))
          .where(eq(church.id, id))
      : [];
    if (!row) throw new NotFoundError(`Church not found: ${id}`);
    return row;
  }

  async slugAvailability({
    id,
    slug,
  }: SlugAvailabilityInput): Promise<
    Exclude<ChurchSlugAvailability, 'reserved'>
  > {
    return this.findSlugAvailability({
      client: getClient({ db: this.db }),
      id,
      slug,
    });
  }

  private async findSlugAvailability({
    client,
    id,
    slug,
  }: FindSlugAvailabilityInput): Promise<
    Exclude<ChurchSlugAvailability, 'reserved'>
  > {
    const [live] = await client
      .select({ id: organization.id })
      .from(organization)
      .where(and(eq(organization.slug, slug), ne(organization.id, id)));
    if (live) return 'taken';
    const [held] = await client
      .select({ churchId: churchSlugHistory.churchId })
      .from(churchSlugHistory)
      .where(eq(churchSlugHistory.slug, slug));
    if (!held) return 'free';
    return held.churchId === id ? 'own_history' : 'taken';
  }

  async saveSettings({
    id,
    changes,
    tx,
  }: SaveChurchSettingsInput): Promise<void> {
    const client = getClient({ db: this.db, tx });
    const { slug, ...fields } = changes;
    await client
      .update(organization)
      .set({ name: fields.name })
      .where(eq(organization.id, id));
    await client
      .update(church)
      .set({ website: fields.website, accentColor: fields.accentColor })
      .where(eq(church.id, id));
    if (slug !== undefined) await this.changeSlug({ client, id, slug });
  }

  /** Records the slug given up and takes the new one; a slug taken back leaves the history. */
  private async changeSlug({
    client,
    id,
    slug,
  }: ChangeSlugInput): Promise<void> {
    const [current] = await client
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, id));
    if (!current || current.slug === slug) return;
    if ((await this.findSlugAvailability({ client, id, slug })) === 'taken') {
      throw new ChurchSlugTakenError(slug);
    }
    await client
      .delete(churchSlugHistory)
      .where(eq(churchSlugHistory.slug, slug));
    await client
      .insert(churchSlugHistory)
      .values({ slug: current.slug, churchId: id })
      .onConflictDoNothing();
    await client
      .update(organization)
      .set({ slug })
      .where(eq(organization.id, id));
  }

  async saveLogoKey({ id, logoKey }: SaveChurchLogoKeyInput): Promise<void> {
    await getClient({ db: this.db })
      .update(church)
      .set({ logoKey })
      .where(eq(church.id, id));
  }
}
