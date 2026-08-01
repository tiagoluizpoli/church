import {
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryVolunteer,
  ministryVolunteerRole,
  role,
  volunteer,
} from '@church/db';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { VolunteerId } from '../../domain/branded-ids';
import type {
  AcceptMinistryInvitationInput,
  RedemptionRepository,
} from '../../domain/contracts/infrastructure/redemption.repository';
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

interface DrizzleRedemptionRepositoryInput {
  db: AnyDrizzleDb;
}

/**
 * Checkpoint-three persistence only. The application manager owns the
 * transaction so a failed grant rolls back the new Volunteer, Ministry
 * Membership, Role grants, and invitation acceptance together.
 */
export class DrizzleRedemptionRepository implements RedemptionRepository {
  constructor({ db }: DrizzleRedemptionRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async acceptPendingMinistryInvitation({
    churchId,
    ministryInvitationId,
    userId,
    acceptedAt,
    tx,
  }: AcceptMinistryInvitationInput): Promise<VolunteerId> {
    const db = getClient(this.db, tx);
    const [pendingInvitation] = await db
      .select({
        ministryId: ministryInvitation.ministryId,
        ministryAccessLevel: ministryInvitation.ministryAccessLevel,
      })
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation(ministryInvitation, churchId),
          eq(ministryInvitation.id, ministryInvitationId),
          eq(ministryInvitation.status, 'pending'),
          gt(ministryInvitation.expiresAt, acceptedAt),
        ),
      )
      .limit(1)
      .for('update');
    if (!pendingInvitation) throw new PendingMinistryInvitationNotFoundError();

    const invitationGrant: PersistedInvitationGrant = pendingInvitation;
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

    const [createdVolunteer] = await db
      .insert(volunteer)
      .values({ churchId, userId })
      .returning({ id: volunteer.id });
    if (!createdVolunteer) throw new Error('Volunteer insert failed');
    const [membership] = await db
      .insert(ministryVolunteer)
      .values({
        churchId,
        ministryId: invitationGrant.ministryId,
        volunteerId: createdVolunteer.id,
        ministryAccessLevel: invitationGrant.ministryAccessLevel,
      })
      .returning({ id: ministryVolunteer.id });
    if (!membership) throw new Error('Ministry membership insert failed');
    if (roleIds.length > 0) {
      await db
        .insert(ministryVolunteerRole)
        .values(
          roleIds.map((roleId) => ({
            churchId,
            ministryVolunteerId: membership.id,
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
    return createdVolunteer.id as VolunteerId;
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
