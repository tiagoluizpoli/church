import {
  member,
  ministryMembership,
  ministryMembershipRole,
  volunteer,
} from '@church/db';
import { and, eq, inArray } from 'drizzle-orm';
import type {
  AuthorityActor,
  ChurchAccessLevel,
  ChurchMembershipFact,
  MinistryMembershipFact,
} from '../../domain/authority/types';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  AuthorityActorRepository,
  ResolveAuthorityActorInput,
} from '../../domain/contracts/infrastructure/authority-actor.repository';
import type { MinistryAccessLevel } from '../../domain/entities/ministry-membership';
import { getClient, withActiveVolunteer } from '../repositories/helpers';
import type { AnyDrizzleDb } from '../repositories/types';

interface ChurchScopedLookupInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  userId: UserId;
}

interface ResolveMembershipFactsInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: VolunteerId;
}

interface MembershipFacts {
  ministryMemberships: MinistryMembershipFact[];
}

interface MembershipRoleRow {
  membershipId: string;
  roleId: string;
}

/** Collect junction-table rows into a `membershipId -> row` lookup. */
function groupByMembership<TRow extends { membershipId: string }>(
  rows: TRow[],
): Map<string, TRow[]> {
  const grouped = new Map<string, TRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.membershipId);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(row.membershipId, [row]);
  }
  return grouped;
}

interface DrizzleAuthorityActorResolverInput {
  db: AnyDrizzleDb;
}

/**
 * Resolves the AuthorityActor AuthorityService evaluates against: Church
 * Membership reads Better Auth's `member` table directly; the caller's own
 * Volunteer profile and Ministry Memberships read scheduling domain tables. Supersedes
 * `DrizzleSchedulingRbacResolver` for callers migrated onto AuthorityService.
 */
export class DrizzleAuthorityActorResolver implements AuthorityActorRepository {
  constructor({ db }: DrizzleAuthorityActorResolverInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async resolveActor(
    input: ResolveAuthorityActorInput,
  ): Promise<AuthorityActor> {
    const { userId, activeChurchId, tx } = input;
    const db = getClient(this.db, tx);

    const [churchMembership, volunteerId] = await Promise.all([
      this.findChurchMembership({ db, churchId: activeChurchId, userId }),
      this.findOwnVolunteerId({ db, churchId: activeChurchId, userId }),
    ]);

    if (!volunteerId) {
      return {
        userId,
        volunteerId: null,
        activeChurchId,
        churchMembership,
        ministryMemberships: [],
      };
    }

    const { ministryMemberships } = await this.resolveMembershipFacts({
      db,
      churchId: activeChurchId,
      volunteerId,
    });

    return {
      userId,
      volunteerId,
      activeChurchId,
      churchMembership,
      ministryMemberships,
    };
  }

  private async findChurchMembership(
    input: ChurchScopedLookupInput,
  ): Promise<ChurchMembershipFact | null> {
    const { db, churchId, userId } = input;
    const [row] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.organizationId, churchId), eq(member.userId, userId)),
      )
      .limit(1);
    return row
      ? { churchId, accessLevel: row.role as ChurchAccessLevel }
      : null;
  }

  private async findOwnVolunteerId(
    input: ChurchScopedLookupInput,
  ): Promise<VolunteerId | null> {
    const { db, churchId, userId } = input;
    const [row] = await db
      .select({ id: volunteer.id })
      .from(volunteer)
      .where(
        and(
          eq(volunteer.userId, userId),
          eq(volunteer.churchId, churchId),
          withActiveVolunteer(volunteer),
        ),
      )
      .limit(1);
    return row ? (row.id as VolunteerId) : null;
  }

  /**
   * One volunteer's active Ministry Memberships across the whole Church, each
   * with its qualified Roles — the inverse scope of
   * `DrizzleVolunteerRepository.listMinistryMemberships`, which lists every
   * volunteer within one ministry.
   */
  private async resolveMembershipFacts(
    input: ResolveMembershipFactsInput,
  ): Promise<MembershipFacts> {
    const { db, churchId, volunteerId } = input;
    const rows = await db
      .select({
        id: ministryMembership.id,
        ministryId: ministryMembership.ministryId,
        ministryAccessLevel: ministryMembership.ministryAccessLevel,
      })
      .from(ministryMembership)
      .where(
        and(
          eq(ministryMembership.volunteerId, volunteerId),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
        ),
      );

    if (rows.length === 0) {
      return { ministryMemberships: [] };
    }

    const membershipIds = rows.map((row) => row.id);
    const roleRows = await db
      .select({
        membershipId: ministryMembershipRole.ministryMembershipId,
        roleId: ministryMembershipRole.roleId,
      })
      .from(ministryMembershipRole)
      .where(
        inArray(ministryMembershipRole.ministryMembershipId, membershipIds),
      );

    const rolesByMembership = groupByMembership<MembershipRoleRow>(roleRows);

    const ministryMemberships: MinistryMembershipFact[] = rows.map((row) => ({
      churchId,
      ministryId: row.ministryId as MinistryId,
      accessLevel: row.ministryAccessLevel as MinistryAccessLevel,
      qualifiedRoleIds: (rolesByMembership.get(row.id) ?? []).map(
        (roleRow) => roleRow.roleId as RoleId,
      ),
    }));

    return { ministryMemberships };
  }
}
