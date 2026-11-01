import {
  invitation as churchInvitation,
  identityAudit,
  invitationVerificationCode,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryMembership,
  role,
  volunteer,
} from '@church/db';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  AcceptMinistryInvitationInput,
  DeclineChurchInvitationInput,
  DeclineChurchInvitationResult,
  DeclineMinistryInvitationInput,
  RecordChurchOnlyPartialAcceptanceInput,
  RedemptionRepository,
} from '../../domain/contracts/infrastructure/redemption.repository';
import type { VolunteerRepository } from '../../domain/contracts/infrastructure/volunteer.repository';
import { CrossChurchVolunteerConflictError } from '../../domain/errors/cross-church-volunteer-conflict';
import { PendingMinistryInvitationNotFoundError } from '../../domain/errors/pending-ministry-invitation-not-found';
import { getClient, withChurchIsolation } from './helpers';
import {
  grantMinistryMembershipRoles,
  insertMinistryMembership,
} from './ministry-grant';
import type { AnyDrizzleDb } from './types';

interface PersistedInvitationGrant {
  ministryAccessLevel: 'leader' | 'volunteer';
  ministryId: string;
}

interface PendingInvitationRole {
  roleId: string;
}

interface ExistingMinistryMembership {
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
    const db = getClient({ db: this.db, tx });
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
          withChurchIsolation({ table: ministryInvitation, churchId }),
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
      const acceptor = await this.volunteerRepository.findByUserId({
        churchId,
        userId,
        tx,
      });
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
          withChurchIsolation({ table: ministryInvitationRole, churchId }),
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

    const existingVolunteer = await this.volunteerRepository.findByUserId({
      churchId,
      userId,
      tx,
    });
    // Spec §7.5: an active Volunteer profile in another Church makes the
    // one-active-profile rule refuse the Ministry half. Thrown before any
    // write, so Church Membership (granted earlier) stands and the invitation
    // stays `pending` for a later Volunteer Transfer (§8). The partial unique
    // index on `volunteer(user_id) WHERE left_at IS NULL` is the structural
    // backstop under this check.
    if (!existingVolunteer) {
      const activeElsewhere =
        await this.volunteerRepository.findByUserIdGlobally({ userId, tx });
      if (activeElsewhere && activeElsewhere.churchId !== churchId) {
        throw new CrossChurchVolunteerConflictError({
          sourceChurchId: activeElsewhere.churchId,
        });
      }
    }
    const volunteerId =
      existingVolunteer?.id ??
      (await this.insertVolunteer({ db, churchId, userId }));

    const existingMembership = await this.findExistingMinistryMembership({
      db,
      churchId,
      volunteerId,
      ministryId: invitationGrant.ministryId,
    });
    const membershipId = existingMembership
      ? await this.topUpMinistryMembership({
          db,
          existingMembership,
          grantedAccessLevel: invitationGrant.ministryAccessLevel,
        })
      : await this.insertMinistryMembership({
          db,
          churchId,
          volunteerId,
          ministryId: invitationGrant.ministryId,
          ministryAccessLevel: invitationGrant.ministryAccessLevel,
        });

    await grantMinistryMembershipRoles({
      db,
      churchId,
      ministryMembershipId: membershipId,
      roleIds,
    });
    const [acceptedInvitation] = await db
      .update(ministryInvitation)
      .set({ status: 'accepted', acceptedAt })
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      )
      .returning({ id: ministryInvitation.id });
    if (!acceptedInvitation) {
      throw new PendingMinistryInvitationNotFoundError();
    }
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
    const db = getClient({ db: this.db, tx });
    const [declined] = await db
      .update(ministryInvitation)
      .set({ status: 'rejected' })
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
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

  async declineChurchInvitation({
    churchInvitationId,
    declinedAt,
    tx,
  }: DeclineChurchInvitationInput): Promise<DeclineChurchInvitationResult> {
    const db = getClient({ db: this.db, tx });
    // The conditional update takes the row lock, so a racing acceptance sees
    // the final status and only one of the two ever wins.
    const [declined] = await db
      .update(churchInvitation)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(churchInvitation.id, churchInvitationId),
          eq(churchInvitation.status, 'pending'),
          gt(churchInvitation.expiresAt, declinedAt),
        ),
      )
      .returning({ id: churchInvitation.id });
    if (!declined) {
      const [existing] = await db
        .select({ status: churchInvitation.status })
        .from(churchInvitation)
        .where(eq(churchInvitation.id, churchInvitationId));
      return existing?.status === 'rejected'
        ? 'already-declined'
        : 'unavailable';
    }
    await db
      .update(ministryInvitation)
      .set({ status: 'rejected' })
      .where(
        and(
          eq(ministryInvitation.churchInvitationId, churchInvitationId),
          eq(ministryInvitation.status, 'pending'),
        ),
      );
    await db
      .delete(invitationVerificationCode)
      .where(
        eq(invitationVerificationCode.churchInvitationId, churchInvitationId),
      );
    return 'declined';
  }

  async recordChurchOnlyPartialAcceptance({
    churchId,
    ministryInvitationId,
    userId,
    correlationId,
    recordedAt,
    tx,
  }: RecordChurchOnlyPartialAcceptanceInput): Promise<void> {
    await getClient({ db: this.db, tx }).insert(identityAudit).values({
      churchId,
      ministryInvitationId,
      actorId: userId,
      action: 'church_only_partial_acceptance',
      correlationId,
      timestamp: recordedAt,
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
  private async findExistingMinistryMembership({
    db,
    churchId,
    volunteerId,
    ministryId,
  }: FindExistingMinistryMembershipInput): Promise<ExistingMinistryMembership | null> {
    const [row] = await db
      .select({
        id: ministryMembership.id,
        ministryAccessLevel: ministryMembership.ministryAccessLevel,
      })
      .from(ministryMembership)
      .where(
        and(
          withChurchIsolation({ table: ministryMembership, churchId }),
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.ministryId, ministryId),
          eq(ministryMembership.status, 'active'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Existing access is never reduced: 'leader' beats 'volunteer' either way. */
  private async topUpMinistryMembership({
    db,
    existingMembership,
    grantedAccessLevel,
  }: TopUpMinistryMembershipInput): Promise<string> {
    const resolvedAccessLevel =
      existingMembership.ministryAccessLevel === 'leader' ||
      grantedAccessLevel === 'leader'
        ? 'leader'
        : 'volunteer';
    if (resolvedAccessLevel !== existingMembership.ministryAccessLevel) {
      await db
        .update(ministryMembership)
        .set({ ministryAccessLevel: resolvedAccessLevel })
        .where(eq(ministryMembership.id, existingMembership.id));
    }
    return existingMembership.id;
  }

  private async insertMinistryMembership({
    db,
    churchId,
    volunteerId,
    ministryId,
    ministryAccessLevel,
  }: InsertMinistryMembershipInput): Promise<string> {
    return insertMinistryMembership({
      db,
      churchId,
      ministryId,
      volunteerId,
      ministryAccessLevel,
    });
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
          withChurchIsolation({ table: ministry, churchId }),
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
          withChurchIsolation({ table: role, churchId }),
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

interface FindExistingMinistryMembershipInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: string;
  ministryId: MinistryId | string;
}

interface TopUpMinistryMembershipInput {
  db: AnyDrizzleDb;
  existingMembership: ExistingMinistryMembership;
  grantedAccessLevel: 'leader' | 'volunteer';
}

interface InsertMinistryMembershipInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: string;
  ministryId: MinistryId | string;
  ministryAccessLevel: 'leader' | 'volunteer';
}
