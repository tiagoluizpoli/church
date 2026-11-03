import {
  member as churchMember,
  ministry,
  ministryMembership,
  ministryMembershipRole,
  role,
  user,
  volunteer,
} from '@church/db';
import {
  and,
  asc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type {
  GetPersonInput,
  ListPeopleInput,
  PeopleListRepository,
} from '../../domain/contracts/infrastructure/people-list.repository';
import type {
  PeopleListFilters,
  PeopleListMinistry,
  PeopleListPage,
  PeopleListScope,
  PersonDetail,
  PersonDetailMinistry,
} from '../../domain/entities/people-list-item';
import { MinistryInvitationNotFoundError } from '../../domain/errors/ministry-invitation-not-found';
import {
  decodePeopleListCursor,
  encodePeopleListCursor,
} from '../../domain/people-list-cursor';
import { getClient } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzlePeopleListRepositoryInput {
  db: AnyDrizzleDb;
}

interface VisibleMembershipInput {
  churchId: string;
  scope: PeopleListScope;
  /** Narrows to one visible Ministry and/or Ministry Access Level on the same membership. */
  ministryId?: string;
  level?: 'leader' | 'volunteer';
}

interface MemberFilterInput {
  churchId: string;
  scope: PeopleListScope;
  filters: PeopleListFilters;
}

interface MinistriesOfInput {
  churchId: string;
  scope: PeopleListScope;
  userIds: string[];
}

/** Escape LIKE wildcards so the text is matched literally. */
function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export class DrizzlePeopleListRepository implements PeopleListRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzlePeopleListRepositoryInput) {
    this.db = db;
  }

  async list({
    churchId,
    scope,
    filters,
    cursor,
    limit,
  }: ListPeopleInput): Promise<PeopleListPage> {
    const client = getClient({ db: this.db });
    const isAdmin = scope.kind === 'church';
    const ministries = await client
      .select({ id: ministry.id, name: ministry.name })
      .from(ministry)
      .where(
        and(
          eq(ministry.churchId, churchId),
          isNull(ministry.deletedAt),
          isAdmin ? undefined : inArray(ministry.id, scope.ministryIds),
        ),
      )
      .orderBy(asc(ministry.name), asc(ministry.id));
    const options = { ministries };
    // One answer for missing, archived, foreign and unled Ministries.
    if (
      filters.ministryId &&
      !ministries.some(({ id }) => id === filters.ministryId)
    ) {
      throw new MinistryInvitationNotFoundError();
    }
    if (!isAdmin && ministries.length === 0) return { items: [], options };

    const position = cursor ? decodePeopleListCursor({ cursor }) : undefined;
    const name = sql`${user.name} COLLATE "C"`;
    const id = sql`${churchMember.id} COLLATE "C"`;
    const rows = await client
      .select({
        id: churchMember.id,
        userId: churchMember.userId,
        name: user.name,
        email: user.email,
        role: churchMember.role,
      })
      .from(churchMember)
      .innerJoin(user, eq(user.id, churchMember.userId))
      .where(
        and(
          eq(churchMember.organizationId, churchId),
          this.memberFilter({ churchId, scope, filters }),
          position &&
            or(
              sql`${name} > ${position.name}`,
              and(sql`${name} = ${position.name}`, sql`${id} > ${position.id}`),
            ),
        ),
      )
      .orderBy(name, id)
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const badges = await this.ministriesOf({
      churchId,
      scope,
      userIds: page.map((row) => row.userId),
    });
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        isAdmin: row.role === 'admin',
        ministries: badges.get(row.userId) ?? [],
      })),
      nextCursor:
        rows.length > limit && last
          ? encodePeopleListCursor({ name: last.name, id: last.id })
          : undefined,
      options,
    };
  }

  async get({
    churchId,
    scope,
    memberId,
    callerId,
  }: GetPersonInput): Promise<PersonDetail | undefined> {
    const client = getClient({ db: this.db });
    const [row] = await client
      .select({
        id: churchMember.id,
        userId: churchMember.userId,
        name: user.name,
        email: user.email,
        role: churchMember.role,
      })
      .from(churchMember)
      .innerJoin(user, eq(user.id, churchMember.userId))
      .where(
        and(
          eq(churchMember.organizationId, churchId),
          eq(churchMember.id, memberId),
        ),
      )
      .limit(1);
    if (!row) return undefined;

    const cards = await client
      .select({
        membershipId: ministryMembership.id,
        ministryId: ministry.id,
        ministryName: ministry.name,
        ministryAccessLevel: ministryMembership.ministryAccessLevel,
      })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          eq(volunteer.userId, row.userId),
          eq(volunteer.churchId, churchId),
          isNull(volunteer.leftAt),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
          isNull(ministryMembership.leftAt),
          eq(ministry.churchId, churchId),
          isNull(ministry.deletedAt),
          scope.kind === 'ministries'
            ? inArray(ministry.id, scope.ministryIds)
            : undefined,
        ),
      )
      .orderBy(asc(ministry.name), asc(ministry.id));
    // A leader's reach is the Ministries they lead: no card, no member.
    if (scope.kind === 'ministries' && cards.length === 0) return undefined;

    const roleRows =
      cards.length === 0
        ? []
        : await client
            .select({
              membershipId: ministryMembershipRole.ministryMembershipId,
              id: role.id,
              name: role.name,
              archivedAt: role.archivedAt,
            })
            .from(ministryMembershipRole)
            .innerJoin(role, eq(role.id, ministryMembershipRole.roleId))
            .where(
              inArray(
                ministryMembershipRole.ministryMembershipId,
                cards.map((card) => card.membershipId),
              ),
            )
            .orderBy(asc(role.name), asc(role.id));
    const ministries: PersonDetailMinistry[] = cards.map((card) => ({
      ...card,
      roles: roleRows
        .filter((r) => r.membershipId === card.membershipId)
        .map((r) => ({ id: r.id, name: r.name, archived: !!r.archivedAt })),
    }));

    const detail = {
      id: row.id,
      name: row.name,
      email: row.email,
      ministries,
    };
    if (scope.kind !== 'church') return detail;
    const isAdmin = row.role === 'admin';
    const admins = isAdmin
      ? await client
          .select({ id: churchMember.id })
          .from(churchMember)
          .where(
            and(
              eq(churchMember.organizationId, churchId),
              eq(churchMember.role, 'admin'),
            ),
          )
          .limit(2)
      : [];
    return {
      ...detail,
      churchAccess: {
        accessLevel: isAdmin ? 'admin' : 'member',
        isLastAdmin: admins.length === 1,
        isSelf: row.userId === callerId,
      },
    };
  }

  /** Search, Ministry and Access combine; a leader's scope is always applied. */
  private memberFilter({
    churchId,
    scope,
    filters,
  }: MemberFilterInput): SQL | undefined {
    const { search, ministryId, access } = filters;
    // Leader/volunteer match one visible membership together with the Ministry; Admin is Church-wide.
    const level = access === 'admin' ? undefined : access;
    const membership =
      level || scope.kind === 'ministries' || ministryId
        ? this.hasVisibleMembership({ churchId, scope, ministryId, level })
        : undefined;
    return and(
      search
        ? or(
            ilike(user.name, containsPattern(search)),
            ilike(user.email, containsPattern(search)),
          )
        : undefined,
      access === 'admin' ? eq(churchMember.role, 'admin') : undefined,
      membership,
    );
  }

  private hasVisibleMembership({
    churchId,
    scope,
    ministryId,
    level,
  }: VisibleMembershipInput): SQL {
    return exists(
      getClient({ db: this.db })
        .select({ one: sql`1` })
        .from(ministryMembership)
        .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
        .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
        .where(
          and(
            eq(volunteer.userId, churchMember.userId),
            eq(volunteer.churchId, churchId),
            isNull(volunteer.leftAt),
            eq(ministryMembership.churchId, churchId),
            eq(ministryMembership.status, 'active'),
            isNull(ministryMembership.leftAt),
            eq(ministry.churchId, churchId),
            isNull(ministry.deletedAt),
            scope.kind === 'ministries'
              ? inArray(ministry.id, scope.ministryIds)
              : undefined,
            ministryId ? eq(ministry.id, ministryId) : undefined,
            level
              ? eq(ministryMembership.ministryAccessLevel, level)
              : undefined,
          ),
        ),
    );
  }

  /** The visible Ministries of each page member, by User id. */
  private async ministriesOf({
    churchId,
    scope,
    userIds,
  }: MinistriesOfInput): Promise<Map<string, PeopleListMinistry[]>> {
    const byUser = new Map<string, PeopleListMinistry[]>();
    if (userIds.length === 0) return byUser;
    const rows = await getClient({ db: this.db })
      .select({
        userId: volunteer.userId,
        id: ministry.id,
        name: ministry.name,
        ministryAccessLevel: ministryMembership.ministryAccessLevel,
      })
      .from(ministryMembership)
      .innerJoin(volunteer, eq(volunteer.id, ministryMembership.volunteerId))
      .innerJoin(ministry, eq(ministry.id, ministryMembership.ministryId))
      .where(
        and(
          inArray(volunteer.userId, userIds),
          eq(volunteer.churchId, churchId),
          isNull(volunteer.leftAt),
          eq(ministryMembership.churchId, churchId),
          eq(ministryMembership.status, 'active'),
          isNull(ministryMembership.leftAt),
          eq(ministry.churchId, churchId),
          isNull(ministry.deletedAt),
          scope.kind === 'ministries'
            ? inArray(ministry.id, scope.ministryIds)
            : undefined,
        ),
      )
      .orderBy(asc(ministry.name), asc(ministry.id));
    for (const { userId, ...badge } of rows) {
      byUser.set(userId, [...(byUser.get(userId) ?? []), badge]);
    }
    return byUser;
  }
}
