import {
  church,
  cycle,
  eventTemplate,
  ministry,
  ministryInvitation,
  role,
  sector,
} from '@church/db';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import type {
  GetSetupProgressInput,
  SetupProgress,
  SetupProgressRepository,
} from '../../domain/contracts/infrastructure/setup-progress.repository';
import { withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleSetupProgressRepositoryInput {
  db: AnyDrizzleDb;
}

/** Issued invitations: pending or accepted, never revoked or declined. */
const ISSUED_INVITATION_STATUSES = ['pending', 'accepted'] as const;

export class DrizzleSetupProgressRepository implements SetupProgressRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleSetupProgressRepositoryInput) {
    this.db = db;
  }

  async get({ churchId }: GetSetupProgressInput): Promise<SetupProgress> {
    const activeMinistries = this.db
      .select({ id: ministry.id })
      .from(ministry)
      .where(
        and(
          withChurchIsolation({ table: ministry, churchId }),
          isNull(ministry.deletedAt),
        ),
      );
    const activeSectors = this.db
      .select({ id: sector.id })
      .from(sector)
      .where(
        and(eq(sector.ministryId, ministry.id), isNull(sector.archivedAt)),
      );
    const activeRoles = this.db
      .select({ id: role.id })
      .from(role)
      .where(and(eq(role.ministryId, ministry.id), isNull(role.archivedAt)));
    const configuredMinistries = this.db
      .select({ id: ministry.id })
      .from(ministry)
      .where(
        and(
          withChurchIsolation({ table: ministry, churchId }),
          isNull(ministry.deletedAt),
          exists(activeSectors),
          exists(activeRoles),
        ),
      );
    const leaderInvitations = this.db
      .select({ id: ministryInvitation.id })
      .from(ministryInvitation)
      .where(
        and(
          withChurchIsolation({ table: ministryInvitation, churchId }),
          eq(ministryInvitation.ministryAccessLevel, 'leader'),
          inArray(ministryInvitation.status, ISSUED_INVITATION_STATUSES),
        ),
      );
    const templates = this.db
      .select({ id: eventTemplate.id })
      .from(eventTemplate)
      .where(withChurchIsolation({ table: eventTemplate, churchId }));
    const sentCycles = this.db
      .select({ id: cycle.id })
      .from(cycle)
      .where(
        and(
          withChurchIsolation({ table: cycle, churchId }),
          eq(cycle.hasBeenSent, true),
        ),
      );

    const [row] = await this.db
      .select({
        hasMinistry: sql<boolean>`${exists(activeMinistries)}`,
        hasMinistryWithSectorsAndRoles: sql<boolean>`${exists(configuredMinistries)}`,
        hasInvitedLeader: sql<boolean>`${exists(leaderInvitations)}`,
        hasEventTemplate: sql<boolean>`${exists(templates)}`,
        hasEverSentCycle: sql<boolean>`${exists(sentCycles)}`,
      })
      .from(church)
      .where(eq(church.id, churchId));

    if (!row) {
      throw new Error(`Church not found: ${churchId}`);
    }

    return row;
  }
}
