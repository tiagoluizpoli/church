import {
  invitation as churchInvitation,
  member,
  ministryInvitation,
  ministryInvitationRole,
  ministryVolunteer,
  outboxMessage,
  user,
  volunteer,
} from '@church/db';
import { and, eq, sql } from 'drizzle-orm';
import type { RoleId, UserId } from '../../domain/branded-ids';
import type {
  AcquireMintLockInput,
  AcquireResendLockInput,
  ApplyResendInput,
  ChurchInvitationSummary,
  CreateChainedChurchInvitationInput,
  CreateMinistryInvitationInput,
  EnqueueOutboxMessageInput,
  FindByIdInput,
  FindChurchMemberByEmailInput,
  FindPendingByChurchInvitationInput,
  FindPendingByIdInput,
  FindPendingByInviteeInput,
  FindPendingChurchInvitationByEmailInput,
  HasActiveMinistryMembershipInput,
  MinistryInvitationRepository,
  RefreshMinistryInvitationExpiryInput,
  ResolveRecipientEmailInput,
} from '../../domain/contracts/infrastructure/ministry-invitation.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import { mapMinistryInvitation } from '../mappers/ministry-invitation.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

/**
 * Better Auth's own default for its `invitation` table (mirrors
 * `provision-church.ts`'s `CHURCH_INVITATION_TTL_MS`) — the pair's expiry is
 * governed by whichever half's clock is shorter, and in practice that is
 * always this one.
 */
const CHURCH_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

interface DrizzleMinistryInvitationRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleMinistryInvitationRepository
  implements MinistryInvitationRepository
{
  constructor({ db }: DrizzleMinistryInvitationRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async acquireMintLock(input: AcquireMintLockInput): Promise<void> {
    const { ministryId, email, tx } = input;
    await getClient(this.db, tx).execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${ministryId}:${email}`}))`,
    );
  }

  async acquireResendLock(input: AcquireResendLockInput): Promise<void> {
    const { ministryInvitationId, tx } = input;
    await getClient(this.db, tx).execute(
      sql`select pg_advisory_xact_lock(hashtext(${ministryInvitationId}))`,
    );
  }

  async findChurchMemberByEmail(
    input: FindChurchMemberByEmailInput,
  ): Promise<UserId | null> {
    const { churchId, email, tx } = input;
    const [row] = await getClient(this.db, tx)
      .select({ userId: member.userId })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, churchId), eq(user.email, email)))
      .limit(1);
    return row ? (row.userId as UserId) : null;
  }

  async findPendingByInvitee(input: FindPendingByInviteeInput) {
    const { churchId, ministryId, inviteeUserId, tx } = input;
    const [row] = await getClient(this.db, tx)
      .select()
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.ministryId, ministryId),
          eq(ministryInvitation.inviteeUserId, inviteeUserId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.hydrate(row);
  }

  async findPendingByChurchInvitation(
    input: FindPendingByChurchInvitationInput,
  ) {
    const { churchId, ministryId, churchInvitationId, tx } = input;
    const [row] = await getClient(this.db, tx)
      .select()
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.ministryId, ministryId),
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.hydrate(row);
  }

  async findPendingById(input: FindPendingByIdInput) {
    const { churchId, ministryId, ministryInvitationId, tx } = input;
    if (!isValidUuid(ministryInvitationId)) return null;
    const [row] = await getClient(this.db, tx)
      .select()
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.ministryId, ministryId),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.hydrate(row);
  }

  async findById(input: FindByIdInput) {
    const { churchId, ministryInvitationId, tx } = input;
    if (!isValidUuid(ministryInvitationId)) return null;
    const [row] = await getClient(this.db, tx)
      .select()
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, ministryInvitationId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.hydrate(row, tx);
  }

  async resolveRecipientEmail(
    input: ResolveRecipientEmailInput,
  ): Promise<string> {
    const { ministryInvitation: invitation, tx } = input;
    const db = getClient(this.db, tx);

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

  async hasActiveMinistryMembership(
    input: HasActiveMinistryMembershipInput,
  ): Promise<boolean> {
    const { churchId, ministryId, userId, tx } = input;
    const db = getClient(this.db, tx);
    const [row] = await db
      .select({ id: ministryVolunteer.id })
      .from(ministryVolunteer)
      .innerJoin(volunteer, eq(volunteer.id, ministryVolunteer.volunteerId))
      .where(
        and(
          eq(volunteer.userId, userId),
          eq(volunteer.churchId, churchId),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .limit(1);
    return row != null;
  }

  async findPendingChurchInvitationByEmail(
    input: FindPendingChurchInvitationByEmailInput,
  ): Promise<ChurchInvitationSummary | null> {
    const { churchId, email, tx } = input;
    const [row] = await getClient(this.db, tx)
      .select({
        id: churchInvitation.id,
        expiresAt: churchInvitation.expiresAt,
      })
      .from(churchInvitation)
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.email, email),
          eq(churchInvitation.status, 'pending'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createChainedChurchInvitation(
    input: CreateChainedChurchInvitationInput,
  ): Promise<ChurchInvitationSummary> {
    const { churchId, email, inviterId, tx } = input;
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + CHURCH_INVITATION_TTL_MS);
    await getClient(this.db, tx).insert(churchInvitation).values({
      id,
      organizationId: churchId,
      email,
      role: 'member',
      status: 'pending',
      expiresAt,
      inviterId,
    });
    return { id, expiresAt };
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
    const db = getClient(this.db, tx);

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
      })
      .returning();
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

    return mapMinistryInvitation(row, roleIds);
  }

  async refreshExpiry(input: RefreshMinistryInvitationExpiryInput) {
    const { churchId, ministryInvitation: invitation, expiresAt, tx } = input;
    const db = getClient(this.db, tx);
    const [row] = await db
      .update(ministryInvitation)
      .set({ expiresAt })
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, invitation.id),
        ),
      )
      .returning();
    if (!row) throw new Error('Ministry invitation not found for refresh');
    return this.hydrate(row);
  }

  async applyResend(input: ApplyResendInput) {
    const {
      churchId,
      ministryInvitation: invitation,
      expiresAt,
      throttle,
      tx,
    } = input;
    const db = getClient(this.db, tx);
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
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, invitation.id),
        ),
      )
      .returning();
    if (!row) throw new Error('Ministry invitation not found for resend');
    return this.hydrate(row);
  }

  async enqueueOutboxMessage(input: EnqueueOutboxMessageInput): Promise<void> {
    const { churchId, kind, payload, correlationId, scheduledFor, tx } = input;
    await getClient(this.db, tx).insert(outboxMessage).values({
      churchId,
      kind,
      payload,
      correlationId,
      scheduledFor,
    });
  }

  private async hydrate(
    row: typeof ministryInvitation.$inferSelect,
    tx?: TransactionContext,
  ) {
    const roleRows = await getClient(this.db, tx)
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(eq(ministryInvitationRole.ministryInvitationId, row.id));
    return mapMinistryInvitation(
      row,
      roleRows.map((r) => r.roleId as RoleId),
    );
  }
}
