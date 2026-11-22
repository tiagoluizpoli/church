import { NotFoundError } from '@church/core';
import {
  church,
  churchAddress,
  churchContact,
  churchContactGroup,
  churchLegalProfile,
  churchSlugHistory,
  churchSocialLink,
  cycle,
  event,
  eventTemplate,
  eventTimeBlock,
  member,
  organization,
  templateTimeBlock,
  user,
} from '@church/db';
import { fromDate, nowAsDate } from '@church/time';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lte,
  ne,
  notInArray,
  or,
} from 'drizzle-orm';
import { union } from 'drizzle-orm/pg-core';
import { ChurchId, type UserId } from '../../domain/branded-ids';
import {
  type AddressReplacement,
  type ChurchAddress,
  ChurchAddressesRefused,
  type ChurchAddressRefusal,
  type ChurchAddressUsage,
  type MainAddressArea,
  type PublicChurchAddress,
  type PublicChurchAddresses,
  resolveChurchAddresses,
} from '../../domain/church-address';
import type { ChurchContact } from '../../domain/church-contact';
import type { ChurchLegalProfile } from '../../domain/church-legal-profile';
import type {
  ChurchSettings,
  ChurchSlugAvailability,
} from '../../domain/church-settings';
import {
  contactGroupKey,
  resolveContactGroups,
} from '../../domain/contact-group';
import type {
  ChurchMemberContact,
  ChurchRepository,
  FindChurchMemberEmailInput,
  FindPublicAddressesInput,
  FindPublicIdentityBySlugInput,
  FindUserNameInput,
  GetChurchAddressUsageInput,
  GetChurchByIdInput,
  GetChurchBySlugInput,
  GetChurchSettingsInput,
  GetPublicContactDetailsInput,
  ListChurchAdminUserIdsInput,
  PublicChurchIdentity,
  PublicContactDetails,
  SaveChurchLogoKeyInput,
  SaveChurchSettingsInput,
  SlugAvailabilityInput,
} from '../../domain/contracts/infrastructure/church.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { Church } from '../../domain/entities/church';
import { ChurchLegalDocumentTakenError } from '../../domain/errors/church-legal-document-taken';
import { ChurchSlugTakenError } from '../../domain/errors/church-slug-taken';
import type {
  ChurchSocialLink,
  SocialLinkChange,
} from '../../domain/social-link';
import { mapChurch } from '../mappers/church.mapper';
import { getClient, isValidUuid } from './helpers';
import { resolvedPlace } from './time-block-place';
import type { AnyDrizzleDb } from './types';
import { isChurchSlugConflict, isUniqueViolation } from './unique-violation';

// Church identity lives on the `organization` row and the rest on the `church`
// extension row keyed by the same id, so every read joins the two.
const churchJoinShape = { church, organization };

interface FreezeStartedBlockPlacesInput {
  client: AnyDrizzleDb;
  id: ChurchId;
}

interface AddressesInUseInput extends FreezeStartedBlockPlacesInput {
  addressIds: readonly string[];
}

interface ReplaceDeletedAddressUsageInput {
  client: AnyDrizzleDb;
  id: ChurchId;
  stored: readonly ChurchAddress[];
  kept: readonly string[];
  replacements: readonly AddressReplacement[];
}

interface FindLegalProfileInput extends ListAddressesInput {
  onlyPublic?: boolean;
}

interface ListContactsInput extends ListAddressesInput {
  onlyPublic?: boolean;
}

interface ListAddressesInput {
  id: string;
  tx?: TransactionContext;
}

const LEGAL_DOCUMENT_UNIQUE = 'church_legal_profile_document_idx';

type DrizzleClient = ReturnType<typeof getClient>;

interface FindSlugAvailabilityInput {
  client: DrizzleClient;
  id: string;
  slug: string;
}

interface ReplaceSocialLinksInput {
  client: DrizzleClient;
  id: string;
  links: readonly (Omit<SocialLinkChange, 'group'> & {
    groupId: string | null;
  })[];
}

interface GroupedRow {
  group: string | null;
}

interface CreatedGroup {
  id: string;
}

interface ReplaceGroupsInput {
  client: DrizzleClient;
  id: string;
  requested: readonly string[];
  members: readonly (string | null)[];
}

interface DeleteUnusedGroupsInput {
  client: DrizzleClient;
  id: string;
}

interface ReplaceLegalProfileInput {
  client: DrizzleClient;
  id: string;
  profile: ChurchLegalProfile | null;
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

  async getById({ id, tx }: GetChurchByIdInput): Promise<Church> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Church not found: ${id}`);
    }
    const [row] = await getClient({ db: this.db, tx })
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

  async findUserName({
    userId,
    tx,
  }: FindUserNameInput): Promise<string | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId));
    return row?.name.trim() || null;
  }

  async getSettings({
    id,
    tx,
  }: GetChurchSettingsInput): Promise<ChurchSettings> {
    const [row] = isValidUuid(id)
      ? await getClient({ db: this.db, tx })
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
    const contacts = await this.listChurchContacts({ id, tx });
    return {
      ...row,
      addresses: await this.listAddresses({ id, tx }),
      socialLinks: await this.listSocialLinks({ id, tx }),
      legalProfile: await this.findLegalProfile({ id, tx }),
      contacts,
      contactGroups: await this.listGroupNames({ id, tx }),
    };
  }

  private async listChurchContacts({
    id,
    tx,
    onlyPublic = false,
  }: ListContactsInput): Promise<ChurchContact[]> {
    return getClient({ db: this.db, tx })
      .select({
        kind: churchContact.kind,
        phoneType: churchContact.phoneType,
        value: churchContact.value,
        description: churchContact.description,
        isWhatsApp: churchContact.isWhatsApp,
        isPublic: churchContact.isPublic,
        group: churchContactGroup.name,
      })
      .from(churchContact)
      .leftJoin(
        churchContactGroup,
        eq(churchContactGroup.id, churchContact.groupId),
      )
      .where(
        and(
          eq(churchContact.churchId, id),
          onlyPublic ? eq(churchContact.isPublic, true) : undefined,
        ),
      )
      .orderBy(asc(churchContact.position), asc(churchContact.id));
  }

  async getPublicContactDetails({
    churchId,
  }: GetPublicContactDetailsInput): Promise<PublicContactDetails> {
    const id = churchId;
    const [contacts, socialLinks, groupNames, legalProfile] = await Promise.all(
      [
        this.listChurchContacts({ id, onlyPublic: true }),
        this.listSocialLinks({ id }),
        this.listGroupNames({ id }),
        // Private legal data never leaves the database.
        this.findLegalProfile({ id, onlyPublic: true }),
      ],
    );
    return { contacts, socialLinks, groupNames, legalProfile };
  }

  private async listGroupNames({
    id,
    tx,
  }: ListAddressesInput): Promise<string[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ name: churchContactGroup.name })
      .from(churchContactGroup)
      .where(eq(churchContactGroup.churchId, id))
      .orderBy(asc(churchContactGroup.position), asc(churchContactGroup.id));
    return rows.map(({ name }) => name);
  }

  private async findLegalProfile({
    id,
    tx,
    onlyPublic = false,
  }: FindLegalProfileInput): Promise<ChurchLegalProfile | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select({
        legalName: churchLegalProfile.legalName,
        cnpj: churchLegalProfile.documentNumber,
        isPublic: churchLegalProfile.isPublic,
      })
      .from(churchLegalProfile)
      .where(
        and(
          eq(churchLegalProfile.churchId, id),
          onlyPublic ? eq(churchLegalProfile.isPublic, true) : undefined,
        ),
      );
    return row ?? null;
  }

  private async listSocialLinks({
    id,
    tx,
  }: ListAddressesInput): Promise<ChurchSocialLink[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({
        url: churchSocialLink.url,
        network: churchSocialLink.network,
        description: churchSocialLink.description,
        group: churchContactGroup.name,
      })
      .from(churchSocialLink)
      .leftJoin(
        churchContactGroup,
        eq(churchContactGroup.id, churchSocialLink.groupId),
      )
      .where(eq(churchSocialLink.churchId, id))
      .orderBy(asc(churchSocialLink.position), asc(churchSocialLink.id));
    return rows as ChurchSocialLink[];
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
    const { slug, contacts, contactGroups, ...fields } = changes;
    await client
      .update(organization)
      .set({ name: fields.name })
      .where(eq(organization.id, id));
    await client
      .update(church)
      .set({ website: fields.website, accentColor: fields.accentColor })
      .where(eq(church.id, id));
    if (slug !== undefined) await this.changeSlug({ client, id, slug });
    const groupIds = await this.replaceGroups({
      client,
      id,
      requested: contactGroups ?? (await this.listGroupNames({ id, tx })),
      // Omitted contacts stay, so their groups must stay too.
      members: [
        ...(contacts ?? (await this.listContacts({ id, tx }))).map(
          ({ group }) => group,
        ),
        ...changes.socialLinks.map(({ group }) => group),
      ],
    });
    const groupIdOf = ({ group }: GroupedRow) =>
      group ? (groupIds.get(contactGroupKey({ name: group })) ?? null) : null;
    await this.replaceSocialLinks({
      client,
      id,
      links: changes.socialLinks.map((link) => ({
        ...link,
        groupId: groupIdOf(link),
      })),
    });
    await this.replaceLegalProfile({
      client,
      id,
      profile: changes.legalProfile,
    });
    const writes = resolveChurchAddresses({
      stored: await this.listAddresses({ id, tx }),
      incoming: changes.addresses,
    });
    const kept = writes.flatMap((write) => (write.id ? [write.id] : []));
    await this.freezeStartedBlockPlaces({ client, id });
    await this.replaceDeletedAddressUsage({
      client,
      id,
      stored: await this.listAddresses({ id, tx }),
      kept,
      replacements: changes.addressReplacements ?? [],
    });
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
    if (contacts !== undefined) {
      await client.delete(churchContact).where(eq(churchContact.churchId, id));
      if (contacts.length > 0) {
        await client.insert(churchContact).values(
          contacts.map((contact, position) => {
            const { group: _group, ...columns } = contact;
            return {
              ...columns,
              groupId: groupIdOf(contact),
              churchId: id,
              position,
            };
          }),
        );
      }
    }
    await this.deleteUnusedGroups({ client, id });
  }

  /** Keeps a stored group (same name, any case) in place, creates the new ones, and returns their ids by name key. */
  private async replaceGroups({
    client,
    id,
    requested,
    members,
  }: ReplaceGroupsInput): Promise<Map<string, string>> {
    const names = resolveContactGroups({ requested, members });
    const stored = await client
      .select({ id: churchContactGroup.id, name: churchContactGroup.name })
      .from(churchContactGroup)
      .where(eq(churchContactGroup.churchId, id));
    const storedByKey = new Map(
      stored.map((row) => [contactGroupKey({ name: row.name }), row.id]),
    );
    const ids = new Map<string, string>();
    for (const [position, name] of names.entries()) {
      const key = contactGroupKey({ name });
      const storedId = storedByKey.get(key);
      if (storedId) {
        await client
          .update(churchContactGroup)
          .set({ name, position })
          .where(eq(churchContactGroup.id, storedId));
        ids.set(key, storedId);
      } else {
        const [created] = await client
          .insert(churchContactGroup)
          .values({ churchId: id, name, position })
          .returning({ id: churchContactGroup.id });
        ids.set(key, (created as CreatedGroup).id);
      }
    }
    return ids;
  }

  /** A group no contact or link uses any more is deleted. */
  private async deleteUnusedGroups({
    client,
    id,
  }: DeleteUnusedGroupsInput): Promise<void> {
    const [contactRows, linkRows] = await Promise.all([
      client
        .select({ groupId: churchContact.groupId })
        .from(churchContact)
        .where(eq(churchContact.churchId, id)),
      client
        .select({ groupId: churchSocialLink.groupId })
        .from(churchSocialLink)
        .where(eq(churchSocialLink.churchId, id)),
    ]);
    const used = [...contactRows, ...linkRows].flatMap(({ groupId }) =>
      groupId ? [groupId] : [],
    );
    await client
      .delete(churchContactGroup)
      .where(
        used.length === 0
          ? eq(churchContactGroup.churchId, id)
          : and(
              eq(churchContactGroup.churchId, id),
              notInArray(churchContactGroup.id, used),
            ),
      );
  }

  private listContacts({ id, tx }: ListAddressesInput): Promise<GroupedRow[]> {
    return getClient({ db: this.db, tx })
      .select({ group: churchContactGroup.name })
      .from(churchContact)
      .leftJoin(
        churchContactGroup,
        eq(churchContactGroup.id, churchContact.groupId),
      )
      .where(eq(churchContact.churchId, id));
  }

  async getAddressUsage({
    id,
    addressId,
    tx,
  }: GetChurchAddressUsageInput): Promise<ChurchAddressUsage | null> {
    const client = getClient({ db: this.db, tx });
    const [address] = await client
      .select({ id: churchAddress.id })
      .from(churchAddress)
      .where(
        and(eq(churchAddress.id, addressId), eq(churchAddress.churchId, id)),
      );
    if (!address) return null;
    const templates = await client
      .selectDistinct({ id: eventTemplate.id, name: eventTemplate.name })
      .from(templateTimeBlock)
      .innerJoin(
        eventTemplate,
        eq(eventTemplate.id, templateTimeBlock.templateId),
      )
      .where(eq(templateTimeBlock.placeAddressId, addressId))
      .orderBy(asc(eventTemplate.name), asc(eventTemplate.id));
    const events = await client
      .selectDistinct({ id: event.id, title: event.title, start: event.start })
      .from(eventTimeBlock)
      .innerJoin(event, eq(event.id, eventTimeBlock.eventId))
      .innerJoin(cycle, eq(cycle.id, event.cycleId))
      .where(
        and(
          eq(eventTimeBlock.placeAddressId, addressId),
          gt(eventTimeBlock.startTime, nowAsDate()),
        ),
      )
      .orderBy(asc(event.start), asc(event.id));
    return {
      templates,
      events: events.map((item) => ({
        ...item,
        start: fromDate({ date: item.start }),
      })),
    };
  }

  /**
   * Started EventTimeBlocks keep the place they had: their resolved place is
   * copied into `place` and the address link dropped, before any address of
   * the Church is edited or deleted. Blocks not yet started follow the address.
   */
  private async freezeStartedBlockPlaces({
    client,
    id,
  }: FreezeStartedBlockPlacesInput): Promise<void> {
    await client
      .update(eventTimeBlock)
      .set({
        place: resolvedPlace(eventTimeBlock.place),
        placeAddressId: null,
      })
      .from(churchAddress)
      .where(
        and(
          eq(eventTimeBlock.churchId, id),
          eq(churchAddress.id, eventTimeBlock.placeAddressId),
          lte(eventTimeBlock.startTime, nowAsDate()),
        ),
      );
  }

  /** The given addresses a template or a not-yet-started EventTimeBlock uses. */
  private async addressesInUse({
    client,
    id,
    addressIds,
  }: AddressesInUseInput): Promise<Set<string>> {
    if (addressIds.length === 0) return new Set();
    const templateUses = client
      .selectDistinct({ addressId: templateTimeBlock.placeAddressId })
      .from(templateTimeBlock)
      .where(
        and(
          eq(templateTimeBlock.churchId, id),
          inArray(templateTimeBlock.placeAddressId, addressIds),
        ),
      );
    const eventUses = client
      .selectDistinct({ addressId: eventTimeBlock.placeAddressId })
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.churchId, id),
          inArray(eventTimeBlock.placeAddressId, addressIds),
          gt(eventTimeBlock.startTime, nowAsDate()),
        ),
      );
    const rows = await union(templateUses, eventUses);
    return new Set(
      rows.flatMap(({ addressId }) => (addressId ? [addressId] : [])),
    );
  }

  /**
   * A deleted address that templates or not-yet-started Events still use needs
   * a replacement (a kept address, or null); it is applied to every reference.
   */
  private async replaceDeletedAddressUsage({
    client,
    id,
    stored,
    kept,
    replacements,
  }: ReplaceDeletedAddressUsageInput): Promise<void> {
    const refusals: ChurchAddressRefusal[] = [];
    replacements.forEach(({ addressId, replacementAddressId }, index) => {
      if (
        replacementAddressId !== null &&
        (replacementAddressId === addressId ||
          !kept.includes(replacementAddressId))
      ) {
        refusals.push({
          field: `addressReplacements.${index}.replacementAddressId`,
          code: 'INVALID',
        });
      }
    });
    const deleted = stored.filter((address) => !kept.includes(address.id));
    const inUse = await this.addressesInUse({
      client,
      id,
      addressIds: deleted.map((address) => address.id),
    });
    for (const { id: addressId } of deleted) {
      const replacement = replacements.find(
        (entry) => entry.addressId === addressId,
      );
      if (inUse.has(addressId) && !replacement) {
        refusals.push({
          field: 'addresses',
          code: 'ADDRESS_REPLACEMENT_REQUIRED',
        });
      }
    }
    if (refusals.length > 0) throw new ChurchAddressesRefused({ refusals });
    for (const { addressId, replacementAddressId } of replacements) {
      if (!deleted.some((address) => address.id === addressId)) continue;
      await client
        .update(templateTimeBlock)
        .set({ placeAddressId: replacementAddressId })
        .where(
          and(
            eq(templateTimeBlock.churchId, id),
            eq(templateTimeBlock.placeAddressId, addressId),
          ),
        );
      await client
        .update(eventTimeBlock)
        .set({ placeAddressId: replacementAddressId })
        .where(
          and(
            eq(eventTimeBlock.churchId, id),
            eq(eventTimeBlock.placeAddressId, addressId),
          ),
        );
    }
  }

  /** The whole list replaces the stored one; list order is the position. */
  private async replaceSocialLinks({
    client,
    id,
    links,
  }: ReplaceSocialLinksInput): Promise<void> {
    await client
      .delete(churchSocialLink)
      .where(eq(churchSocialLink.churchId, id));
    if (links.length === 0) return;
    await client
      .insert(churchSocialLink)
      .values(
        links.map((link, position) => ({ ...link, churchId: id, position })),
      );
  }

  /** No profile deletes the stored one; a CNPJ another Church holds throws without naming it. */
  private async replaceLegalProfile({
    client,
    id,
    profile,
  }: ReplaceLegalProfileInput): Promise<void> {
    if (!profile) {
      await client
        .delete(churchLegalProfile)
        .where(eq(churchLegalProfile.churchId, id));
      return;
    }
    const { legalName, cnpj, isPublic } = profile;
    const values = { legalName, documentNumber: cnpj, isPublic };
    try {
      await client
        .insert(churchLegalProfile)
        .values({ ...values, churchId: id })
        .onConflictDoUpdate({
          target: churchLegalProfile.churchId,
          set: values,
        });
    } catch (error) {
      if (isUniqueViolation({ error, constraint: LEGAL_DOCUMENT_UNIQUE })) {
        throw new ChurchLegalDocumentTakenError();
      }
      throw error;
    }
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
    try {
      await client
        .insert(churchSlugHistory)
        .values({ slug: current.slug, churchId: id })
        .onConflictDoNothing();
      await client
        .update(organization)
        .set({ slug })
        .where(eq(organization.id, id));
    } catch (error) {
      // Another write claimed the slug after the check above (the database holds the rule, 0070).
      if (isChurchSlugConflict({ error })) throw new ChurchSlugTakenError(slug);
      throw error;
    }
  }

  async saveLogoKey({ id, logoKey }: SaveChurchLogoKeyInput): Promise<void> {
    await getClient({ db: this.db })
      .update(church)
      .set({ logoKey })
      .where(eq(church.id, id));
  }

  async findPublicIdentityBySlug({
    slug,
  }: FindPublicIdentityBySlugInput): Promise<PublicChurchIdentity | null> {
    // The database keeps live slugs and history disjoint (0070); a live match still wins.
    const [row] = await getClient({ db: this.db })
      .select({
        churchId: church.id,
        timezone: church.timezone,
        slug: organization.slug,
        name: organization.name,
        accentColor: church.accentColor,
        logoKey: church.logoKey,
      })
      .from(church)
      .innerJoin(organization, eq(organization.id, church.id))
      .leftJoin(
        churchSlugHistory,
        and(
          eq(churchSlugHistory.churchId, church.id),
          eq(churchSlugHistory.slug, slug),
        ),
      )
      .where(or(eq(organization.slug, slug), eq(churchSlugHistory.slug, slug)))
      .orderBy(desc(eq(organization.slug, slug)), church.id)
      .limit(1);
    return row ? { ...row, churchId: ChurchId.from(row.churchId) } : null;
  }

  async findPublicAddresses({
    churchId,
  }: FindPublicAddressesInput): Promise<PublicChurchAddresses> {
    const client = getClient({ db: this.db });
    const [addresses, [main]] = await Promise.all([
      client
        .select({
          label: churchAddress.label,
          street: churchAddress.street,
          number: churchAddress.number,
          complement: churchAddress.complement,
          bairro: churchAddress.bairro,
          city: churchAddress.city,
          uf: churchAddress.uf,
          cep: churchAddress.cep,
          latitude: churchAddress.latitude,
          longitude: churchAddress.longitude,
          placeId: churchAddress.placeId,
          isMain: churchAddress.isMain,
        })
        .from(churchAddress)
        .where(
          and(
            eq(churchAddress.churchId, churchId),
            eq(churchAddress.isPublic, true),
          ),
        )
        .orderBy(
          desc(churchAddress.isMain),
          asc(churchAddress.position),
          asc(churchAddress.id),
        ),
      // Only the area of the Main Address, public or not: a private one's
      // street, number and pin never leave the database.
      client
        .select({
          bairro: churchAddress.bairro,
          city: churchAddress.city,
          uf: churchAddress.uf,
        })
        .from(churchAddress)
        .where(
          and(
            eq(churchAddress.churchId, churchId),
            eq(churchAddress.isMain, true),
          ),
        ),
    ]);
    return {
      addresses: addresses as PublicChurchAddress[],
      mainAddressArea: main
        ? { ...main, uf: main.uf as MainAddressArea['uf'] }
        : null,
    };
  }
}
