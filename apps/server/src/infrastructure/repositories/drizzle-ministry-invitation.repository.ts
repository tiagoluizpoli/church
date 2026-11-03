import type { AppConfig } from '@church/app-config';
import {
  church,
  invitation as churchInvitation,
  member,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryMembership,
  organization,
  outboxMessage,
  role,
  user,
  volunteer,
} from '@church/db';
import {
  addMilliseconds,
  fromDate,
  now,
  nowAsDate,
  toDate,
} from '@church/time';
import { and, asc, desc, eq, gt, ne, or, sql } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../domain/branded-ids';
import type {
  AcquireChurchOfferLockInput,
  AcquireMintLockInput,
  AlignPairedExpiryInput,
  ApplyChurchResendInput,
  ApplyResendInput,
  CancelChurchInvitationInput,
  CancelMinistryInvitationInput,
  ChurchInvitationStatus,
  ChurchInvitationSummary,
  CreateChurchInvitationInput,
  CreateMinistryInvitationInput,
  EnqueueOutboxMessageInput,
  FindByIdInput,
  FindChurchMemberByEmailInput,
  FindMinistryInvitationContextInput,
  FindPendingChurchInvitationByEmailInput,
  FindPendingChurchOfferInput,
  FindPendingForAddressInput,
  FindPendingSiblingMinistryInvitationsInput,
  FindPublicRedemptionPreviewInput,
  HasActiveMinistryMembershipInput,
  IsInvitationAddressedToUserInput,
  LockChurchInvitationInput,
  LockedChurchInvitation,
  LockMinistryInvitationInput,
  LockPendingHalvesInput,
  MinistryInvitationContext,
  MinistryInvitationRepository,
  PendingChurchOffer,
  PendingMinistryInvitationReference,
  ResolveRecipientEmailInput,
  SupersedeUnsentChainedOutboxInput,
  UpgradeChurchInvitationToAdminInput,
} from '../../domain/contracts/infrastructure/ministry-invitation.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  PublicRedemptionMinistry,
  PublicRedemptionPreview,
} from '../../domain/entities/public-redemption-preview';
import { PendingChurchInvitationExistsError } from '../../domain/errors/pending-church-invitation-exists';
import { PendingMinistryInvitationExistsError } from '../../domain/errors/pending-ministry-invitation-exists';
import { resolveInvitationEmail } from '../../domain/services/resolve-invitation-email';
import { mapMinistryInvitation } from '../mappers/ministry-invitation.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';
import { isUniqueViolation } from './unique-violation';

/** The database backstops behind the locked duplicate recheck. */
const PENDING_HALF_CONSTRAINTS = [
  'ministry_invitation_ministry_invitee_pending_idx',
  'ministry_invitation_ministry_church_invitation_pending_idx',
];

interface HydrateMinistryInvitationInput {
  row: typeof ministryInvitation.$inferSelect;
  tx?: TransactionContext;
}

interface DrizzleMinistryInvitationRepositoryInput {
  db: AnyDrizzleDb;
  config: AppConfig;
}

export class DrizzleMinistryInvitationRepository
  implements MinistryInvitationRepository
{
  constructor({ db, config }: DrizzleMinistryInvitationRepositoryInput) {
    this.db = db;
    this.churchInvitationTtlMs = config.churchInvitation.ttlMs;
  }

  private readonly db: AnyDrizzleDb;
  private readonly churchInvitationTtlMs: number;

  async acquireMintLock(input: AcquireMintLockInput): Promise<void> {
    const { ministryId, email, tx } = input;
    await getClient({ db: this.db, tx }).execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${ministryId}:${email}`}))`,
    );
  }

  async acquireChurchOfferLock(
    input: AcquireChurchOfferLockInput,
  ): Promise<void> {
    const { churchId, email, tx } = input;
    await getClient({ db: this.db, tx }).execute(
      sql`select pg_advisory_xact_lock(hashtext(${`church-offer:${churchId}:${email}`}))`,
    );
  }

  async findChurchMemberByEmail(
    input: FindChurchMemberByEmailInput,
  ): Promise<UserId | null> {
    const { churchId, email, tx } = input;
    const [row] = await getClient({ db: this.db, tx })
      .select({ userId: member.userId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, churchId),
          eq(sql`lower(${user.email})`, email),
        ),
      )
      .limit(1);
    return row ? (row.userId as UserId) : null;
  }

  async findPendingForAddress(
    input: FindPendingForAddressInput,
  ): Promise<PendingMinistryInvitationReference | null> {
    const { churchId, ministryId, email, tx } = input;
    const [row] = await getClient({ db: this.db, tx })
      .select({
        id: ministryInvitation.id,
        createdAt: ministryInvitation.createdAt,
      })
      .from(ministryInvitation)
      .leftJoin(user, eq(user.id, ministryInvitation.inviteeUserId))
      .leftJoin(
        churchInvitation,
        eq(churchInvitation.id, ministryInvitation.churchInvitationId),
      )
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.ministryId, ministryId),
          eq(ministryInvitation.status, 'pending'),
          or(
            eq(sql`lower(${user.email})`, email),
            eq(sql`lower(${churchInvitation.email})`, email),
          ),
        ),
      )
      .orderBy(asc(ministryInvitation.createdAt))
      .limit(1);
    return row
      ? { id: row.id, createdAt: fromDate({ date: row.createdAt }) }
      : null;
  }

  async lockMinistryInvitation(input: LockMinistryInvitationInput) {
    const { churchId, ministryInvitationId, tx } = input;
    if (!isValidUuid(ministryInvitationId)) return null;
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.id, ministryInvitationId),
        ),
      )
      .limit(1)
      .for('update');
    if (!row) return null;
    return this.hydrate({ row, tx });
  }

  async lockChurchInvitation({
    churchId,
    churchInvitationId,
    tx,
  }: LockChurchInvitationInput): Promise<LockedChurchInvitation | null> {
    const [row] = await getClient({ db: this.db, tx })
      .select({
        status: churchInvitation.status,
        lastResendAt: churchInvitation.lastResendAt,
        resendCount: churchInvitation.resendCount,
        resendWindowStartedAt: churchInvitation.resendWindowStartedAt,
      })
      .from(churchInvitation)
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.id, churchInvitationId),
        ),
      )
      .limit(1)
      .for('update');
    return row
      ? {
          ...row,
          status: row.status as ChurchInvitationStatus,
          lastResendAt: row.lastResendAt
            ? fromDate({ date: row.lastResendAt })
            : undefined,
          resendWindowStartedAt: row.resendWindowStartedAt
            ? fromDate({ date: row.resendWindowStartedAt })
            : undefined,
        }
      : null;
  }

  async applyChurchResend({
    churchId,
    churchInvitationId,
    throttle,
    tx,
  }: ApplyChurchResendInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(churchInvitation)
      .set(throttle)
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      );
  }

  async cancelMinistryInvitation({
    churchId,
    ministryInvitationId,
    revocation,
    tx,
  }: CancelMinistryInvitationInput): Promise<boolean> {
    const { actorId, at, reason } = revocation;
    const canceled = await getClient({ db: this.db, tx })
      .update(ministryInvitation)
      .set({
        status: 'canceled',
        canceledAt: at,
        canceledById: actorId,
        cancelReason: reason,
      })
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .returning({ id: ministryInvitation.id });
    return canceled.length > 0;
  }

  async cancelChurchInvitation({
    churchId,
    churchInvitationId,
    revocation,
    tx,
  }: CancelChurchInvitationInput): Promise<boolean> {
    const { actorId, at, reason } = revocation;
    const canceled = await getClient({ db: this.db, tx })
      .update(churchInvitation)
      .set({
        status: 'canceled',
        canceledAt: at,
        canceledById: actorId,
        cancelReason: reason,
      })
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .returning({ id: churchInvitation.id });
    return canceled.length > 0;
  }

  async lockPendingHalves({
    churchId,
    churchInvitationId,
    tx,
  }: LockPendingHalvesInput): Promise<string[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ id: ministryInvitation.id })
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .orderBy(ministryInvitation.id)
      .for('update');
    return rows.map(({ id }) => id);
  }

  async findById(input: FindByIdInput) {
    const { churchId, ministryInvitationId, tx } = input;
    if (!isValidUuid(ministryInvitationId)) return null;
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.id, ministryInvitationId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.hydrate({ row, tx });
  }

  async resolveRecipientEmail(
    input: ResolveRecipientEmailInput,
  ): Promise<string> {
    const { ministryInvitation: invitation, tx } = input;
    const db = getClient({ db: this.db, tx });

    if (invitation.inviteeUserId) {
      const [row] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, invitation.inviteeUserId))
        .limit(1);
      if (!row)
        throw new Error('Invitee user not found for ministry invitation');
      return row.email;
    }

    const [row] = await db
      .select({ email: churchInvitation.email })
      .from(churchInvitation)
      .where(eq(churchInvitation.id, invitation.churchInvitationId as string))
      .limit(1);
    if (!row) {
      throw new Error(
        'Chained church invitation not found for ministry invitation',
      );
    }
    return row.email;
  }

  async findPublicRedemptionPreview({
    churchInvitationId,
    now,
  }: FindPublicRedemptionPreviewInput): Promise<PublicRedemptionPreview | null> {
    if (!isValidUuid(churchInvitationId)) return null;
    const [found] = await this.db
      .select({
        churchId: churchInvitation.organizationId,
        email: churchInvitation.email,
        role: churchInvitation.role,
        churchName: organization.name,
        expiresAt: churchInvitation.expiresAt,
      })
      .from(churchInvitation)
      .innerJoin(
        organization,
        eq(organization.id, churchInvitation.organizationId),
      )
      .where(
        and(
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
          gt(churchInvitation.expiresAt, now),
        ),
      );
    if (!found) return null;
    return {
      churchId: found.churchId as ChurchId,
      churchInvitationId,
      email: found.email,
      churchName: found.churchName,
      churchAccessLevel: found.role === 'admin' ? 'admin' : 'member',
      expiresAt: found.expiresAt,
      ministries: await this.findPendingPairedMinistries({
        churchInvitationId,
        now,
      }),
    };
  }

  /** Every pending, unexpired Ministry half paired with the Church Invitation, newest first. */
  private async findPendingPairedMinistries({
    churchInvitationId,
    now,
  }: FindPublicRedemptionPreviewInput): Promise<PublicRedemptionMinistry[]> {
    const rows = await this.db
      .select({
        ministryInvitationId: ministryInvitation.id,
        ministryName: ministry.name,
        ministryAccessLevel: ministryInvitation.ministryAccessLevel,
        roleName: role.name,
      })
      .from(ministryInvitation)
      .innerJoin(ministry, eq(ministry.id, ministryInvitation.ministryId))
      .leftJoin(
        ministryInvitationRole,
        eq(ministryInvitationRole.ministryInvitationId, ministryInvitation.id),
      )
      .leftJoin(role, eq(role.id, ministryInvitationRole.roleId))
      .where(
        and(
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          eq(ministryInvitation.status, 'pending'),
          gt(ministryInvitation.expiresAt, now),
        ),
      )
      .orderBy(desc(ministryInvitation.createdAt), asc(role.name));
    const halves = new Map<string, PublicRedemptionMinistry>();
    for (const row of rows) {
      const half = halves.get(row.ministryInvitationId) ?? {
        ministryInvitationId: row.ministryInvitationId as MinistryInvitationId,
        ministryName: row.ministryName,
        ministryAccessLevel: row.ministryAccessLevel,
        roleNames: [],
      };
      if (row.roleName) half.roleNames.push(row.roleName);
      halves.set(row.ministryInvitationId, half);
    }
    return [...halves.values()];
  }

  async findPendingSiblingMinistryInvitationIds({
    churchInvitationId,
    exceptMinistryInvitationId,
    now,
    tx,
  }: FindPendingSiblingMinistryInvitationsInput): Promise<string[]> {
    const rows = await getClient({ db: this.db, tx })
      .select({ id: ministryInvitation.id })
      .from(ministryInvitation)
      .where(
        and(
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          ne(ministryInvitation.id, exceptMinistryInvitationId),
          eq(ministryInvitation.status, 'pending'),
          gt(ministryInvitation.expiresAt, now),
        ),
      )
      .orderBy(asc(ministryInvitation.createdAt), asc(ministryInvitation.id));
    return rows.map((row) => row.id);
  }

  async findMinistryInvitationContext({
    ministryInvitationId,
    tx,
  }: FindMinistryInvitationContextInput): Promise<MinistryInvitationContext | null> {
    if (!isValidUuid(ministryInvitationId)) return null;
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select({
        invitation: ministryInvitation,
        churchInvitationStatus: churchInvitation.status,
        churchInvitationEmail: churchInvitation.email,
        inviteeEmail: user.email,
        churchName: organization.name,
        ministryName: ministry.name,
        roleId: role.id,
        roleName: role.name,
      })
      .from(ministryInvitation)
      .innerJoin(church, eq(church.id, ministryInvitation.churchId))
      .innerJoin(organization, eq(organization.id, church.id))
      .innerJoin(ministry, eq(ministry.id, ministryInvitation.ministryId))
      .leftJoin(
        churchInvitation,
        eq(churchInvitation.id, ministryInvitation.churchInvitationId),
      )
      .leftJoin(user, eq(user.id, ministryInvitation.inviteeUserId))
      .leftJoin(
        ministryInvitationRole,
        eq(ministryInvitationRole.ministryInvitationId, ministryInvitation.id),
      )
      .leftJoin(role, eq(role.id, ministryInvitationRole.roleId))
      .where(eq(ministryInvitation.id, ministryInvitationId));
    const first = rows[0];
    if (!first) return null;
    const roleIds = rows.flatMap((row) =>
      row.roleId ? [row.roleId as RoleId] : [],
    );
    const email = resolveInvitationEmail({
      inviteeEmail: first.inviteeEmail,
      churchInvitationEmail: first.churchInvitationEmail,
    });
    return {
      ministryInvitation: mapMinistryInvitation({
        row: first.invitation,
        roleIds,
      }),
      churchInvitationStatus: (first.churchInvitationStatus ?? undefined) as
        | 'pending'
        | 'accepted'
        | 'rejected'
        | 'canceled'
        | undefined,
      email,
      churchName: first.churchName,
      ministryName: first.ministryName,
      roleNames: rows.flatMap((row) => (row.roleName ? [row.roleName] : [])),
    };
  }

  async isInvitationAddressedToUser({
    ministryInvitation: invitation,
    userId,
    tx,
  }: IsInvitationAddressedToUserInput): Promise<boolean> {
    if (invitation.inviteeUserId) return invitation.inviteeUserId === userId;
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select({ id: user.id })
      .from(churchInvitation)
      .innerJoin(user, eq(user.email, churchInvitation.email))
      .where(
        and(
          eq(churchInvitation.id, invitation.churchInvitationId as string),
          eq(user.id, userId),
        ),
      )
      .limit(1);
    return row != null;
  }

  async hasActiveMinistryMembership(
    input: HasActiveMinistryMembershipInput,
  ): Promise<boolean> {
    const { churchId, ministryId, userId, tx } = input;
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select({ id: ministryMembership.id })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .where(
        and(
          eq(volunteer.userId, userId),
          eq(volunteer.churchId, churchId),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .limit(1);
    return row != null;
  }

  async findPendingChurchInvitationByEmail(
    input: FindPendingChurchInvitationByEmailInput,
  ): Promise<ChurchInvitationSummary | null> {
    const { churchId, email, tx } = input;
    const [row] = await getClient({ db: this.db, tx })
      .select({
        id: churchInvitation.id,
        expiresAt: churchInvitation.expiresAt,
        role: churchInvitation.role,
      })
      .from(churchInvitation)
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(sql`lower(${churchInvitation.email})`, email),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .limit(1)
      .for('update');
    if (!row) return null;
    return {
      id: row.id,
      expiresAt: row.expiresAt,
      churchAccessLevel: row.role === 'admin' ? 'admin' : 'member',
    };
  }

  async createChurchInvitation(
    input: CreateChurchInvitationInput,
  ): Promise<ChurchInvitationSummary> {
    const { churchId, email, inviterId, churchAccessLevel, tx } = input;
    const id = crypto.randomUUID();
    const expiresAtInstant = addMilliseconds({
      instant: now(),
      milliseconds: this.churchInvitationTtlMs,
    });
    const expiresAt = toDate({ instant: expiresAtInstant });
    await getClient({ db: this.db, tx })
      .insert(churchInvitation)
      .values({
        id,
        organizationId: churchId,
        email,
        role: churchAccessLevel,
        status: 'pending',
        expiresAt,
        inviterId,
      })
      .catch((error: unknown) => {
        if (
          isUniqueViolation({
            error,
            constraint: 'invitation_organization_email_pending_idx',
          })
        ) {
          throw new PendingChurchInvitationExistsError();
        }
        throw error;
      });
    return { id, expiresAt, churchAccessLevel };
  }

  async upgradeChurchInvitationToAdmin({
    churchId,
    churchInvitationId,
    tx,
  }: UpgradeChurchInvitationToAdminInput): Promise<void> {
    const upgraded = await getClient({ db: this.db, tx })
      .update(churchInvitation)
      .set({ role: 'admin' })
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .returning({ id: churchInvitation.id });
    // The caller holds the row lock, so this only fires on a broken invariant.
    if (upgraded.length === 0) {
      throw new Error('Church invitation is no longer pending for upgrade');
    }
  }

  async findPendingChurchOffer({
    churchId,
    churchInvitationId,
  }: FindPendingChurchOfferInput): Promise<PendingChurchOffer | null> {
    const [offer] = await this.db
      .select({
        email: churchInvitation.email,
        role: churchInvitation.role,
        expiresAt: churchInvitation.expiresAt,
      })
      .from(churchInvitation)
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .limit(1);
    if (!offer) return null;
    const halves = await this.db
      .select({ id: ministryInvitation.id })
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .orderBy(asc(ministryInvitation.createdAt), asc(ministryInvitation.id));
    return {
      email: offer.email,
      churchAccessLevel: offer.role === 'admin' ? 'admin' : 'member',
      expiresAt: offer.expiresAt,
      pendingMinistryInvitationIds: halves.map((half) => half.id),
    };
  }

  async create(input: CreateMinistryInvitationInput) {
    const {
      churchId,
      ministryId,
      ministryAccessLevel,
      inviterId,
      inviteeUserId,
      churchInvitationId,
      roleIds,
      expiresAt,
      tx,
    } = input;
    const db = getClient({ db: this.db, tx });

    const [row] = await db
      .insert(ministryInvitation)
      .values({
        churchId,
        ministryId,
        ministryAccessLevel,
        inviterId,
        inviteeUserId,
        churchInvitationId,
        expiresAt,
        createdAt: nowAsDate(),
      })
      .returning()
      .catch((error: unknown) => {
        if (
          PENDING_HALF_CONSTRAINTS.some((constraint) =>
            isUniqueViolation({ error, constraint }),
          )
        ) {
          throw new PendingMinistryInvitationExistsError({});
        }
        throw error;
      });
    if (!row) throw new Error('Ministry invitation insert failed');

    if (roleIds.length > 0) {
      await db.insert(ministryInvitationRole).values(
        roleIds.map((roleId) => ({
          churchId,
          ministryInvitationId: row.id,
          roleId,
        })),
      );
    }

    return mapMinistryInvitation({ row, roleIds });
  }

  async alignPairedExpiry({
    churchId,
    churchInvitationId,
    expiresAt,
    tx,
  }: AlignPairedExpiryInput): Promise<boolean> {
    const db = getClient({ db: this.db, tx });
    const parent = await db
      .update(churchInvitation)
      .set({ expiresAt })
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .returning({ id: churchInvitation.id });
    if (parent.length === 0) return false;
    await db
      .update(ministryInvitation)
      .set({ expiresAt })
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      );
    return true;
  }

  async supersedeUnsentChainedOutbox({
    churchId,
    churchInvitationId,
    tx,
  }: SupersedeUnsentChainedOutboxInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(outboxMessage)
      .set({
        status: 'failed',
        lastError: 'Superseded by the Church offer T1 after an admin upgrade',
      })
      .where(
        and(
          eq(outboxMessage.churchId, churchId),
          eq(outboxMessage.kind, 'invitation.chained'),
          eq(outboxMessage.status, 'pending'),
          sql`${outboxMessage.payload}->>'churchInvitationId' = ${churchInvitationId}`,
        ),
      );
  }

  async applyResend(input: ApplyResendInput) {
    const {
      churchId,
      ministryInvitation: invitation,
      expiresAt,
      throttle,
      tx,
    } = input;
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .update(ministryInvitation)
      .set({
        expiresAt,
        lastResendAt: throttle.lastResendAt,
        resendCount: throttle.resendCount,
        resendWindowStartedAt: throttle.resendWindowStartedAt,
      })
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.id, invitation.id),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .returning();
    // The caller holds the row lock, so this only fires on a broken invariant.
    if (!row)
      throw new Error('Ministry invitation is no longer pending for resend');
    return this.hydrate({ row, tx });
  }

  async enqueueOutboxMessage(input: EnqueueOutboxMessageInput): Promise<void> {
    const { churchId, kind, payload, correlationId, scheduledFor, tx } = input;
    await getClient({ db: this.db, tx }).insert(outboxMessage).values({
      churchId,
      kind,
      payload,
      correlationId,
      scheduledFor,
    });
  }

  private async hydrate({ row, tx }: HydrateMinistryInvitationInput) {
    const roleRows = await getClient({ db: this.db, tx })
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(eq(ministryInvitationRole.ministryInvitationId, row.id));
    return mapMinistryInvitation({
      row,
      roleIds: roleRows.map((r) => r.roleId as RoleId),
    });
  }
}
