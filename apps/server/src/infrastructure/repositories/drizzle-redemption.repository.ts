import {
  identityAudit,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryVolunteer,
  ministryVolunteerRole,
  outboxMessage,
  role,
  volunteer,
} from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  AcceptMinistryInvitationInput,
  DeclineMinistryInvitationInput,
  RedemptionRepository,
} from '../../domain/contracts/infrastructure/redemption.repository';
import type { VolunteerRepository } from '../../domain/contracts/infrastructure/volunteer.repository';
import { PendingMinistryInvitationNotFoundError } from '../../domain/errors/pending-ministry-invitation-not-found';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface PersistedInvitationGrant {
  ministryAccessLevel: 'leader' | 'volunteer';
  ministryId: string;
}

interface PendingInvitationRole {
  roleId: string;
}

interface ExistingMinistryVolunteer {
  id: string;
  ministryAccessLevel: 'leader' | 'volunteer';
}

interface DrizzleRedemptionRepositoryInput {
  db: AnyDrizzleDb;
  volunteerRepository: VolunteerRepository;
}

/**
 * Checkpoint-three persistence only. The application manager owns the
 * transaction so a failed grant rolls back the new Volunteer, Ministry
 * Membership, Role grants, invitation acceptance, and confirmation outbox
 * message together.
 */
export class DrizzleRedemptionRepository implements RedemptionRepository {
  constructor({ db, volunteerRepository }: DrizzleRedemptionRepositoryInput) {
    this.db = db;
    this.volunteerRepository = volunteerRepository;
  }

  private readonly db: AnyDrizzleDb;
  private readonly volunteerRepository: VolunteerRepository;

  async acceptPendingMinistryInvitation({
    churchId,
    ministryInvitationId,
    userId,
    acceptedAt,
    correlationId,
    auditAction,
    tx,
  }: AcceptMinistryInvitationInput): Promise<VolunteerId> {
    const db = getClient(this.db, tx);
    const [invitationRow] = await db
      .select({
        status: ministryInvitation.status,
        ministryId: ministryInvitation.ministryId,
        ministryAccessLevel: ministryInvitation.ministryAccessLevel,
        expiresAt: ministryInvitation.expiresAt,
      })
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, ministryInvitationId),
        ),
      )
      .limit(1)
      .for('update');
    if (!invitationRow) throw new PendingMinistryInvitationNotFoundError();

    // A retry of a checkpoint that already committed (spec §7.4's monotonic
    // checkpoints): no new grant, no second audit/outbox row — just hand
    // back the Volunteer this same User already holds from that commit.
    if (invitationRow.status === 'accepted') {
      const acceptor = await this.volunteerRepository.findByUserId(
        churchId,
        userId,
        tx,
      );
      if (acceptor) return acceptor.id;
      throw new PendingMinistryInvitationNotFoundError();
    }
    if (
      invitationRow.status !== 'pending' ||
      invitationRow.expiresAt <= acceptedAt
    ) {
      throw new PendingMinistryInvitationNotFoundError();
    }

    const invitationGrant: PersistedInvitationGrant = invitationRow;
    const invitationRoles = await db
      .select({ roleId: ministryInvitationRole.roleId })
      .from(ministryInvitationRole)
      .where(
        and(
          withChurchIsolation(ministryInvitationRole, churchId),
          eq(ministryInvitationRole.ministryInvitationId, ministryInvitationId),
        ),
      );
    const roleIds = invitationRoles.map(({ roleId }) => roleId);
    await this.assertInvitationGrantScope({
      db,
      churchId,
      ministryId: invitationGrant.ministryId,
      invitationRoles,
    });

    const existingVolunteer = await this.volunteerRepository.findByUserId(
      churchId,
      userId,
      tx,
    );
    const volunteerId =
      existingVolunteer?.id ??
      (await this.insertVolunteer({ db, churchId, userId }));

    const existingMembership = await this.findExistingMinistryVolunteer({
      db,
      churchId,
      volunteerId,
      ministryId: invitationGrant.ministryId,
    });
    const membershipId = existingMembership
      ? await this.topUpMinistryVolunteer({
          db,
          existingMembership,
          grantedAccessLevel: invitationGrant.ministryAccessLevel,
        })
      : await this.insertMinistryVolunteer({
          db,
          churchId,
          volunteerId,
          ministryId: invitationGrant.ministryId,
          ministryAccessLevel: invitationGrant.ministryAccessLevel,
        });

    if (roleIds.length > 0) {
      await db
        .insert(ministryVolunteerRole)
        .values(
          roleIds.map((roleId) => ({
            churchId,
            ministryVolunteerId: membershipId,
            roleId,
          })),
        )
        .onConflictDoNothing();
    }
    const [acceptedInvitation] = await db
      .update(ministryInvitation)
      .set({ status: 'accepted', acceptedAt })
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .returning({ id: ministryInvitation.id });
    if (!acceptedInvitation) {
      throw new PendingMinistryInvitationNotFoundError();
    }
    await db.insert(outboxMessage).values({
      churchId,
      kind: 'redemption.accepted',
      payload: {
        ministryInvitationId,
        volunteerId,
      },
      correlationId,
      scheduledFor: acceptedAt,
    });
    await db.insert(identityAudit).values({
      churchId,
      ministryInvitationId,
      actorId: userId,
      action: auditAction,
      correlationId,
      timestamp: acceptedAt,
    });
    return volunteerId as VolunteerId;
  }

  async declineMinistryInvitation({
    churchId,
    ministryInvitationId,
    userId,
    declinedAt,
    correlationId,
    tx,
  }: DeclineMinistryInvitationInput): Promise<void> {
    const db = getClient(this.db, tx);
    const [declined] = await db
      .update(ministryInvitation)
      .set({ status: 'rejected' })
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .returning({ id: ministryInvitation.id });
    if (!declined) throw new PendingMinistryInvitationNotFoundError();
    await db.insert(identityAudit).values({
      churchId,
      ministryInvitationId,
      actorId: userId,
      action: 'decline',
      correlationId,
      timestamp: declinedAt,
    });
  }

  private async insertVolunteer({
    db,
    churchId,
    userId,
  }: InsertVolunteerInput): Promise<string> {
    const [createdVolunteer] = await db
      .insert(volunteer)
      .values({ churchId, userId })
      .returning({ id: volunteer.id });
    if (!createdVolunteer) throw new Error('Volunteer insert failed');
    return createdVolunteer.id;
  }

  /**
   * Scoped to `status = 'active'` — an inactive/left membership is not
   * "existing access" to preserve; acceptance grants a fresh one instead.
   */
  private async findExistingMinistryVolunteer({
    db,
    churchId,
    volunteerId,
    ministryId,
  }: FindExistingMinistryVolunteerInput): Promise<ExistingMinistryVolunteer | null> {
    const [row] = await db
      .select({
        id: ministryVolunteer.id,
        ministryAccessLevel: ministryVolunteer.ministryAccessLevel,
      })
      .from(ministryVolunteer)
      .where(
        and(
          withChurchIsolation(ministryVolunteer, churchId),
          eq(ministryVolunteer.volunteerId, volunteerId),
          eq(ministryVolunteer.ministryId, ministryId),
          eq(ministryVolunteer.status, 'active'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Existing access is never reduced: 'leader' beats 'volunteer' either way. */
  private async topUpMinistryVolunteer({
    db,
    existingMembership,
    grantedAccessLevel,
  }: TopUpMinistryVolunteerInput): Promise<string> {
    const resolvedAccessLevel =
      existingMembership.ministryAccessLevel === 'leader' ||
      grantedAccessLevel === 'leader'
        ? 'leader'
        : 'volunteer';
    if (resolvedAccessLevel !== existingMembership.ministryAccessLevel) {
      await db
        .update(ministryVolunteer)
        .set({ ministryAccessLevel: resolvedAccessLevel })
        .where(eq(ministryVolunteer.id, existingMembership.id));
    }
    return existingMembership.id;
  }

  private async insertMinistryVolunteer({
    db,
    churchId,
    volunteerId,
    ministryId,
    ministryAccessLevel,
  }: InsertMinistryVolunteerInput): Promise<string> {
    const [membership] = await db
      .insert(ministryVolunteer)
      .values({ churchId, ministryId, volunteerId, ministryAccessLevel })
      .returning({ id: ministryVolunteer.id });
    if (!membership) throw new Error('Ministry membership insert failed');
    return membership.id;
  }

  private async assertInvitationGrantScope({
    db,
    churchId,
    ministryId,
    invitationRoles,
  }: AssertInvitationGrantScopeInput): Promise<void> {
    const [scopedMinistry] = await db
      .select({ id: ministry.id })
      .from(ministry)
      .where(
        and(
          withChurchIsolation(ministry, churchId),
          eq(ministry.id, ministryId),
        ),
      )
      .limit(1);
    if (!scopedMinistry) throw new PendingMinistryInvitationNotFoundError();

    const roleIds = invitationRoles.map(({ roleId }) => roleId);
    if (roleIds.length === 0) return;
    const scopedRoles = await db
      .select({ id: role.id })
      .from(role)
      .where(
        and(
          withChurchIsolation(role, churchId),
          eq(role.ministryId, ministryId),
          inArray(role.id, roleIds),
        ),
      );
    if (scopedRoles.length !== roleIds.length) {
      throw new PendingMinistryInvitationNotFoundError();
    }
  }
}

interface AssertInvitationGrantScopeInput {
  db: AnyDrizzleDb;
  churchId: AcceptMinistryInvitationInput['churchId'];
  ministryId: string;
  invitationRoles: PendingInvitationRole[];
}

interface InsertVolunteerInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  userId: AcceptMinistryInvitationInput['userId'];
}

interface FindExistingMinistryVolunteerInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: string;
  ministryId: MinistryId | string;
}

interface TopUpMinistryVolunteerInput {
  db: AnyDrizzleDb;
  existingMembership: ExistingMinistryVolunteer;
  grantedAccessLevel: 'leader' | 'volunteer';
}

interface InsertMinistryVolunteerInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: string;
  ministryId: MinistryId | string;
  ministryAccessLevel: 'leader' | 'volunteer';
}
