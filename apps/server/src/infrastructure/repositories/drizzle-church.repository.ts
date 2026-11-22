import { NotFoundError } from '@church/core';
import { church, churchAddress, member, organization, user } from '@church/db';
import { and, asc, eq, notInArray } from 'drizzle-orm';
import type { UserId } from '../../domain/branded-ids';
import {
  type ChurchAddress,
  resolveChurchAddresses,
} from '../../domain/church-address';
import type { ChurchSettings } from '../../domain/church-settings';
import type {
  ChurchMemberContact,
  ChurchRepository,
  FindChurchMemberEmailInput,
  FindUserNameInput,
  GetChurchByIdInput,
  GetChurchBySlugInput,
  ListChurchAdminUserIdsInput,
  SaveChurchSettingsInput,
} from '../../domain/contracts/infrastructure/church.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { Church } from '../../domain/entities/church';
import { mapChurch } from '../mappers/church.mapper';
import { getClient, isValidUuid } from './helpers';
import type { AnyDrizzleDb } from './types';

// Church identity lives on the `organization` row and the rest on the `church`
// extension row keyed by the same id, so every read joins the two.
const churchJoinShape = { church, organization };

interface ListAddressesInput {
  id: string;
  tx?: TransactionContext;
}

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
          })
          .from(church)
          .innerJoin(organization, eq(organization.id, church.id))
          .where(eq(church.id, id))
      : [];
    if (!row) throw new NotFoundError(`Church not found: ${id}`);
    return { ...row, addresses: await this.listAddresses({ id }) };
  }

  private async listAddresses({
    id,
    tx,
  }: ListAddressesInput): Promise<ChurchAddress[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({
        id: churchAddress.id,
        label: churchAddress.label,
        street: churchAddress.street,
        number: churchAddress.number,
        complement: churchAddress.complement,
        bairro: churchAddress.bairro,
        city: churchAddress.city,
        uf: churchAddress.uf,
        cep: churchAddress.cep,
        country: churchAddress.country,
        isPublic: churchAddress.isPublic,
        isMain: churchAddress.isMain,
        latitude: churchAddress.latitude,
        longitude: churchAddress.longitude,
        pinSource: churchAddress.pinSource,
        placeId: churchAddress.placeId,
      })
      .from(churchAddress)
      .where(eq(churchAddress.churchId, id))
      .orderBy(asc(churchAddress.position), asc(churchAddress.id));
    return rows as ChurchAddress[];
  }

  async saveSettings({
    id,
    changes,
    tx,
  }: SaveChurchSettingsInput): Promise<void> {
    const client = getClient({ db: this.db, tx });
    await client
      .update(organization)
      .set({ name: changes.name })
      .where(eq(organization.id, id));
    await client
      .update(church)
      .set({ website: changes.website, accentColor: changes.accentColor })
      .where(eq(church.id, id));
    const writes = resolveChurchAddresses({
      stored: await this.listAddresses({ id, tx }),
      incoming: changes.addresses,
    });
    const kept = writes.flatMap((write) => (write.id ? [write.id] : []));
    await client
      .delete(churchAddress)
      .where(
        kept.length === 0
          ? eq(churchAddress.churchId, id)
          : and(
              eq(churchAddress.churchId, id),
              notInArray(churchAddress.id, kept),
            ),
      );
    // The Main Address goes last so the one-main index never sees two.
    for (const write of [...writes].sort(
      (a, b) => Number(a.isMain) - Number(b.isMain),
    )) {
      const { id: addressId, ...values } = write;
      if (addressId) {
        await client
          .update(churchAddress)
          .set(values)
          .where(
            and(
              eq(churchAddress.id, addressId),
              eq(churchAddress.churchId, id),
            ),
          );
      } else {
        await client.insert(churchAddress).values({ ...values, churchId: id });
      }
    }
  }
}
