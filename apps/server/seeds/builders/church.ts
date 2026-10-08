import {
  addChurchMember,
  type ChurchAccessLevel,
  type ChurchRecord,
  createChurch,
  invitation,
  user,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CHURCH_ACCESS_LEVEL_OPTIONS } from '../../src/domain/authority/types';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { provisionChurch } from '../../src/scripts/provision-church';
import { SEED_PLATFORM_OPERATOR_ID } from '../blueprints/credentials';
import type { SeedWriter } from '../recipe';

const ChurchAccessLevelSchema = z.enum(CHURCH_ACCESS_LEVEL_OPTIONS);

export interface BuildProvisionedChurchInput {
  db: SeedWriter;
  id: string;
  name: string;
  slug: string;
  timezone: string;
  adminEmail: string;
  adminInvitationId: string;
}

export interface ProvisionedChurch {
  church: ChurchRecord;
  /** The pending first Church Invitation provisioning addressed to `adminEmail`. */
  adminInvitationId: string;
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
