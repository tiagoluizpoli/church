import {
  addChurchMember,
  type ChurchAccessLevel,
  type ChurchRecord,
  church,
  churchAddress,
  churchContact,
  churchContactGroup,
  churchLegalProfile,
  churchSocialLink,
  createChurch,
  invitation,
  user,
} from '@church/db';
import { detectSocialNetwork } from '@church/domain-rules/social-networks';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { z } from 'zod';
import { storeChurchLogo } from '../../src/application/church-logo-pipeline';
import { CHURCH_ACCESS_LEVEL_OPTIONS } from '../../src/domain/authority/types';
import { ChurchId } from '../../src/domain/branded-ids';
import type { ChurchContact } from '../../src/domain/church-contact';
import type { ObjectStorage } from '../../src/domain/contracts/infrastructure/object-storage';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { provisionChurch } from '../../src/scripts/provision-church';
import { SEED_PLATFORM_OPERATOR_ID } from '../blueprints/credentials';
import type {
  ChurchAddressBlueprint,
  ChurchSocialLinkBlueprint,
} from '../blueprints/directory/types';
import type { SeedWriter } from '../recipe';
import { deriveSeedId } from './derived-id';

const ChurchAccessLevelSchema = z.enum(CHURCH_ACCESS_LEVEL_OPTIONS);

export interface BuildProvisionedChurchInput {
  db: SeedWriter;
  id: string;
  name: string;
  /** Omitted, derived from the name through the Church Slug schema. */
  slug?: string;
  timezone: string;
  adminEmail: string;
  adminInvitationId: string;
}

export interface ProvisionedChurch {
  church: ChurchRecord;
  /** The pending first Church Invitation provisioning addressed to `adminEmail`. */
  adminInvitationId: string;
  /** The relative link provisioning prints for hand delivery. */
  redemptionPath: string;
}

/**
 * Church Provisioning is a domain origin every seeded Church must pass
 * through, so this runs the real operation — organization, Church extension
 * row and first Church Invitation — as the local stand-in Platform Operator.
 */
export async function buildProvisionedChurch({
  db,
  id,
  name,
  slug,
  timezone,
  adminEmail,
  adminInvitationId,
}: BuildProvisionedChurchInput): Promise<ProvisionedChurch> {
  const operator = await ensurePlatformOperator({
    db,
    id: SEED_PLATFORM_OPERATOR_ID,
  });
  const provisioned = await provisionChurch({
    db,
    id,
    churchName: name,
    churchSlug: slug,
    timezone,
    adminEmail,
    operatorUserId: operator.id,
    invitationId: adminInvitationId,
    // The seed redeems the invitation itself, so its path is already spent.
    reportRedemptionPath: false,
  });

  return {
    church: provisioned.church,
    adminInvitationId: provisioned.invitationId,
    redemptionPath: provisioned.redemptionPath,
  };
}

export interface RedeemChurchInvitationInput {
  db: SeedWriter;
  invitationId: string;
  userId: string;
  churchMembershipId: string;
}

/**
 * Direct-state builder, exceptional-fixture purpose: real redemption is
 * Better Auth's `acceptInvitation`, which needs a signed-in HTTP session a
 * seed does not have. This records the same outcome — the invitation
 * accepted and the invitee's Church Membership at the invited Access Level —
 * and refuses anything redemption itself would refuse.
 */
export async function redeemChurchInvitation({
  db,
  invitationId,
  userId,
  churchMembershipId,
}: RedeemChurchInvitationInput): Promise<void> {
  const [pending] = await db
    .select()
    .from(invitation)
    .where(
      and(eq(invitation.id, invitationId), eq(invitation.status, 'pending')),
    );
  if (!pending) {
    throw new Error(`Pending Church Invitation not found: ${invitationId}`);
  }

  const [invitee] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  if (invitee?.email !== pending.email.toLowerCase()) {
    throw new Error(
      `Church Invitation ${invitationId} is not addressed to User ${userId}.`,
    );
  }

  const accessLevel = ChurchAccessLevelSchema.parse(pending.role);

  await db
    .update(invitation)
    .set({ status: 'accepted' })
    .where(eq(invitation.id, invitationId));

  await addChurchMember({
    db,
    churchId: pending.organizationId,
    userId,
    accessLevel,
    id: churchMembershipId,
  });
}

export interface BuildChurchSettingsInput {
  db: SeedWriter;
  churchId: string;
  website: string | null;
  accentColor: string | null;
}

/** Direct-state builder: the Church Settings fields the Church extension row holds. */
export async function buildChurchSettings({
  db,
  churchId,
  website,
  accentColor,
}: BuildChurchSettingsInput): Promise<void> {
  await db
    .update(church)
    .set({ website, accentColor })
    .where(eq(church.id, churchId));
}

export interface BuildChurchContactGroupsInput {
  db: SeedWriter;
  churchId: string;
  /** Group names in display order; each is created once. */
  names: readonly string[];
}

/** Direct-state builder: the Church's Contact Groups; returns their ids by name. */
export async function buildChurchContactGroups({
  db,
  churchId,
  names,
}: BuildChurchContactGroupsInput): Promise<Map<string, string>> {
  const groups = names.map((name, position) => ({
    id: deriveSeedId({
      kind: 'church-contact-group',
      parentIds: [churchId, String(position)],
    }),
    churchId,
    name,
    position,
  }));
  if (groups.length > 0) await db.insert(churchContactGroup).values(groups);
  return new Map(groups.map(({ name, id }) => [name, id]));
}

export interface BuildChurchContactsInput {
  db: SeedWriter;
  churchId: string;
  contacts: ChurchContact[];
  /** Group ids by name, from `buildChurchContactGroups`. */
  groupIds: ReadonlyMap<string, string>;
}

/** Direct-state builder: the Church Contacts of a Church, in the given order. */
export async function buildChurchContacts({
  db,
  churchId,
  contacts,
  groupIds,
}: BuildChurchContactsInput): Promise<void> {
  if (contacts.length === 0) return;
  await db.insert(churchContact).values(
    contacts.map(({ group, ...contact }, position) => ({
      ...contact,
      groupId: group ? (groupIds.get(group) ?? null) : null,
      id: deriveSeedId({
        kind: 'church-contact',
        parentIds: [churchId, String(position)],
      }),
      churchId,
      position,
    })),
  );
}

export interface BuildChurchAddressesInput {
  db: SeedWriter;
  churchId: string;
  addresses: readonly ChurchAddressBlueprint[];
}

export interface ChurchAddressSeedIdInput {
  churchId: string;
  position: number;
}

/** The derived id of the Church's address at `position` in its blueprint. */
export function churchAddressSeedId({
  churchId,
  position,
}: ChurchAddressSeedIdInput): string {
  return deriveSeedId({
    kind: 'church-address',
    parentIds: [churchId, String(position)],
  });
}

/** Direct-state builder: the Church's addresses in order, the first one main. */
export async function buildChurchAddresses({
  db,
  churchId,
  addresses,
}: BuildChurchAddressesInput): Promise<void> {
  if (addresses.length === 0) return;
  await db.insert(churchAddress).values(
    addresses.map((address, position) => ({
      id: churchAddressSeedId({ churchId, position }),
      churchId,
      label: address.label ?? null,
      street: address.street,
      number: address.number,
      complement: address.complement ?? null,
      bairro: address.bairro,
      city: address.city,
      uf: address.uf,
      cep: address.cep?.replace('-', '') ?? null,
      isPublic: address.isPublic ?? true,
      isMain: position === 0,
      position,
      latitude: address.pin?.latitude ?? null,
      longitude: address.pin?.longitude ?? null,
      pinSource: address.pin?.source ?? null,
    })),
  );
}

export interface BuildChurchLogoInput {
  db: SeedWriter;
  objectStorage: ObjectStorage;
  churchId: string;
  svg: string;
}

/** Uploads the logo through the app's own pipeline and points the Church at it. */
export async function buildChurchLogo({
  db,
  objectStorage,
  churchId,
  svg,
}: BuildChurchLogoInput): Promise<string> {
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  const logoKey = await storeChurchLogo({
    objectStorage,
    churchId: ChurchId.from(churchId),
    bytes,
  });
  await db.update(church).set({ logoKey }).where(eq(church.id, churchId));
  return logoKey;
}

export interface BuildChurchInput {
  db: SeedWriter;
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

/**
 * Direct-state builder, exceptional-fixture purpose: both halves of a Church
 * (organization and Church extension row) without the Platform Operator or the
 * first Church Invitation that Church Provisioning adds. For fixtures whose
 * behavior does not depend on how the Church came to be; use
 * `buildProvisionedChurch` when it does.
 */
export async function buildChurch({
  db,
  id,
  name,
  slug,
  timezone,
}: BuildChurchInput): Promise<ChurchRecord> {
  return await createChurch({ db, id, name, slug, timezone });
}

export interface BuildChurchMembershipInput {
  db: SeedWriter;
  churchId: string;
  userId: string;
  accessLevel: ChurchAccessLevel;
  id?: string;
}

/** A Church Membership at an Access Level, recorded without an invitation. */
export async function buildChurchMembership({
  db,
  churchId,
  userId,
  accessLevel,
  id,
}: BuildChurchMembershipInput): Promise<void> {
  await addChurchMember({ db, churchId, userId, accessLevel, id });
}

export interface BuildChurchSocialLinksInput {
  db: SeedWriter;
  churchId: string;
  socialLinks: readonly ChurchSocialLinkBlueprint[];
  /** Group ids by name, from `buildChurchContactGroups`. */
  groupIds: ReadonlyMap<string, string>;
}

/** Direct-state builder: the Church's Social Links in order, networks detected from the URLs. */
export async function buildChurchSocialLinks({
  db,
  churchId,
  socialLinks,
  groupIds,
}: BuildChurchSocialLinksInput): Promise<void> {
  if (socialLinks.length === 0) return;
  await db.insert(churchSocialLink).values(
    socialLinks.map((link, position) => {
      const detection = detectSocialNetwork({ url: link.url });
      if ('refusal' in detection) {
        throw new Error(`Seed social link ${link.url}: ${detection.refusal}`);
      }
      return {
        id: deriveSeedId({
          kind: 'church-social-link',
          parentIds: [churchId, String(position)],
        }),
        churchId,
        url: link.url,
        network: detection.network,
        description: link.description ?? null,
        groupId: link.group ? (groupIds.get(link.group) ?? null) : null,
        position,
      };
    }),
  );
}

export interface BuildChurchLegalProfileInput {
  db: SeedWriter;
  churchId: string;
  legalProfile?: { legalName: string; cnpj: string; isPublic: boolean };
}

/** Direct-state builder: the Church Legal Profile, when the blueprint has one. */
export async function buildChurchLegalProfile({
  db,
  churchId,
  legalProfile,
}: BuildChurchLegalProfileInput): Promise<void> {
  if (!legalProfile) return;
  await db.insert(churchLegalProfile).values({
    churchId,
    legalName: legalProfile.legalName,
    documentNumber: legalProfile.cnpj,
    isPublic: legalProfile.isPublic,
  });
}
