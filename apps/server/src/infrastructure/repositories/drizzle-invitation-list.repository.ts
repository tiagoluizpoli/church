import {
  invitation as churchInvitation,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  outboxMessage,
  role,
  user,
} from '@church/db';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  InvitationListRepository,
  ListPendingInvitationsInput,
} from '../../domain/contracts/infrastructure/invitation-list.repository';
import type {
  InvitationEmailDelivery,
  InvitationListItem,
  InvitationListKind,
  InvitationListPage,
  InvitationListRole,
} from '../../domain/entities/invitation-list-item';
import {
  decodeInvitationListCursor,
  encodeInvitationListCursor,
  type InvitationListCursorPosition,
} from '../../domain/invitation-list-cursor';
import { projectInvitationEmailDelivery } from '../../domain/services/invitation-email-delivery';
import { getClient } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleInvitationListRepositoryInput {
  db: AnyDrizzleDb;
}

interface KindQueryInput {
  churchId: string;
  limit: number;
  position?: InvitationListCursorPosition;
}

interface MinistryQueryInput extends KindQueryInput {
  ministryIds?: string[];
}

interface DeliveryLookupInput {
  churchId: string;
  ministryInvitationIds: string[];
  churchInvitationIds: string[];
}

const inviter = alias(user, 'inviter');
const invitee = alias(user, 'invitee');

interface RowOrderKey {
  createdAt: Date;
  kind: InvitationListKind;
  id: string;
}

interface IsBeforeInput {
  a: RowOrderKey;
  b: RowOrderKey;
}

interface AfterCursorInput {
  kind: InvitationListKind;
  position?: InvitationListCursorPosition;
  createdAt: Parameters<typeof lt>[0];
  id: Parameters<typeof lt>[0];
}

interface RolesByInvitationInput {
  ids: string[];
}

/** Newest first; equal Instants fall back to kind then id, compared byte-wise like the SQL `COLLATE "C"`. */
function isBefore({ a, b }: IsBeforeInput): boolean {
  const time = b.createdAt.getTime() - a.createdAt.getTime();
  if (time !== 0) return time < 0;
  if (a.kind !== b.kind) return a.kind > b.kind;
  return a.id > b.id;
}

/** Rows strictly after the cursor in the newest-first order, for one kind. */
function afterCursor({
  kind,
  position,
  createdAt,
  id,
}: AfterCursorInput): SQL | undefined {
  if (!position) return undefined;
  // Same-Instant rows of a later-sorting kind were already served.
  if (kind > position.kind) return lt(createdAt, position.createdAt);
  if (kind < position.kind) return lte(createdAt, position.createdAt);
  return or(
    lt(createdAt, position.createdAt),
    and(
      eq(createdAt, position.createdAt),
      // Better Auth ids are text and must compare byte-wise, like `isBefore`; UUIDs already do.
      kind === 'church'
        ? sql`${id} COLLATE "C" < ${position.id} COLLATE "C"`
        : sql`${id} < ${position.id}`,
    ),
  );
}

export class DrizzleInvitationListRepository
  implements InvitationListRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleInvitationListRepositoryInput) {
    this.db = db;
  }

  async listPending({
    churchId,
    scope,
    cursor,
    limit,
    now,
  }: ListPendingInvitationsInput): Promise<InvitationListPage> {
    const position = cursor
      ? decodeInvitationListCursor({ cursor })
      : undefined;
    if (cursor && !position) throw new Error('Invalid invitation cursor');

    const isAdmin = scope.kind === 'church';
    const ministryIds = isAdmin ? undefined : scope.ministryIds;
    if (ministryIds?.length === 0) return { items: [] };

    const query = { churchId, limit: limit + 1, position };
    const [ministryRows, churchRows] = await Promise.all([
      this.ministryOffers({ ...query, ministryIds }),
      // Standalone admin grants are never visible to a Ministry leader.
      isAdmin ? this.adminChurchGrants(query) : [],
    ]);

    const merged = [...ministryRows, ...churchRows]
      .sort((a, b) => (isBefore({ a, b }) ? -1 : 1))
      .slice(0, limit + 1);
    const page = merged.slice(0, limit);

    const [roles, deliveries] = await Promise.all([
      this.rolesByInvitation({
        ids: page.filter((row) => row.kind === 'ministry').map((r) => r.id),
      }),
      this.latestDeliveries({
        churchId,
        ministryInvitationIds: page
          .filter((row) => row.kind === 'ministry')
          .map((row) => row.id),
        churchInvitationIds: page
          .filter((row) => row.kind === 'church')
          .map((row) => row.id),
      }),
    ]);

    const items: InvitationListItem[] = page.map(({ ...row }) => ({
      ...row,
      // A leader must not learn the Church-wide grant behind a paired offer.
      churchInvitationId: isAdmin ? row.churchInvitationId : undefined,
      churchAccessLevel: isAdmin ? row.churchAccessLevel : undefined,
      roles: roles.get(row.id) ?? [],
      displayStatus:
        row.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending',
      emailDelivery: deliveries.get(`${row.kind}:${row.id}`) ?? {
        state: 'unavailable',
      },
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        merged.length > limit && last
          ? encodeInvitationListCursor({
              createdAt: last.createdAt,
              kind: last.kind,
              id: last.id,
            })
          : undefined,
    };
  }

  private async ministryOffers({
    churchId,
    limit,
    position,
    ministryIds,
  }: MinistryQueryInput) {
    const rows = await getClient({ db: this.db })
      .select({
        id: ministryInvitation.id,
        churchInvitationId: ministryInvitation.churchInvitationId,
        ministryId: ministryInvitation.ministryId,
        ministryName: ministry.name,
        ministryAccessLevel: ministryInvitation.ministryAccessLevel,
        inviteeEmail: invitee.email,
        churchEmail: churchInvitation.email,
        churchRole: churchInvitation.role,
        inviterId: inviter.id,
        inviterName: inviter.name,
        createdAt: ministryInvitation.createdAt,
        expiresAt: ministryInvitation.expiresAt,
      })
      .from(ministryInvitation)
      .innerJoin(ministry, eq(ministry.id, ministryInvitation.ministryId))
      .innerJoin(inviter, eq(inviter.id, ministryInvitation.inviterId))
      .leftJoin(invitee, eq(invitee.id, ministryInvitation.inviteeUserId))
      .leftJoin(
        churchInvitation,
        eq(churchInvitation.id, ministryInvitation.churchInvitationId),
      )
      .where(
        and(
          eq(ministryInvitation.churchId, churchId),
          eq(ministryInvitation.status, 'pending'),
          isNull(ministry.deletedAt),
          ministryIds
            ? inArray(ministryInvitation.ministryId, ministryIds)
            : undefined,
          afterCursor({
            kind: 'ministry',
            position,
            createdAt: ministryInvitation.createdAt,
            id: ministryInvitation.id,
          }),
        ),
      )
      .orderBy(desc(ministryInvitation.createdAt), desc(ministryInvitation.id))
      .limit(limit);

    return rows.map((row) => ({
      kind: 'ministry' as const,
      id: row.id,
      churchInvitationId: row.churchInvitationId ?? undefined,
      ministryId: row.ministryId,
      ministryName: row.ministryName,
      email: row.inviteeEmail ?? row.churchEmail ?? '',
      churchAccessLevel:
        row.churchRole === 'admin' ? ('admin' as const) : undefined,
      ministryAccessLevel: row.ministryAccessLevel,
      invitedBy: { id: row.inviterId, name: row.inviterName },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: 'pending' as const,
    }));
  }

  private async adminChurchGrants({
    churchId,
    limit,
    position,
  }: KindQueryInput) {
    const rows = await getClient({ db: this.db })
      .select({
        id: churchInvitation.id,
        email: churchInvitation.email,
        inviterId: inviter.id,
        inviterName: inviter.name,
        createdAt: churchInvitation.createdAt,
        expiresAt: churchInvitation.expiresAt,
      })
      .from(churchInvitation)
      .innerJoin(inviter, eq(inviter.id, churchInvitation.inviterId))
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.status, 'pending'),
          eq(churchInvitation.role, 'admin'),
          afterCursor({
            kind: 'church',
            position,
            createdAt: churchInvitation.createdAt,
            id: churchInvitation.id,
          }),
        ),
      )
      .orderBy(
        desc(churchInvitation.createdAt),
        sql`${churchInvitation.id} COLLATE "C" DESC`,
      )
      .limit(limit);

    return rows.map((row) => ({
      kind: 'church' as const,
      id: row.id,
      churchInvitationId: row.id,
      ministryId: undefined,
      ministryName: undefined,
      email: row.email,
      churchAccessLevel: 'admin' as const,
      ministryAccessLevel: undefined,
      invitedBy: { id: row.inviterId, name: row.inviterName },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: 'pending' as const,
    }));
  }

  /** Roles are read apart from the page rows so they can never multiply them. */
  private async rolesByInvitation({
    ids,
  }: RolesByInvitationInput): Promise<Map<string, InvitationListRole[]>> {
    const byInvitation = new Map<string, InvitationListRole[]>();
    if (ids.length === 0) return byInvitation;
    const rows = await getClient({ db: this.db })
      .select({
        invitationId: ministryInvitationRole.ministryInvitationId,
        id: role.id,
        name: role.name,
      })
      .from(ministryInvitationRole)
      .innerJoin(role, eq(role.id, ministryInvitationRole.roleId))
      .where(inArray(ministryInvitationRole.ministryInvitationId, ids))
      .orderBy(asc(role.name), asc(role.id));
    for (const row of rows) {
      const list = byInvitation.get(row.invitationId) ?? [];
      list.push({ id: row.id, name: row.name });
      byInvitation.set(row.invitationId, list);
    }
    return byInvitation;
  }

  /** The latest outbox row per offer, keyed `<kind>:<id>`; an offer with none is absent. */
  private async latestDeliveries({
    churchId,
    ministryInvitationIds,
    churchInvitationIds,
  }: DeliveryLookupInput): Promise<Map<string, InvitationEmailDelivery>> {
    const latest = new Map<string, InvitationEmailDelivery>();
    const subjects: SQL[] = [];
    if (ministryInvitationIds.length > 0) {
      subjects.push(
        sql`(${outboxMessage.kind} = 'invitation.chained' AND ${outboxMessage.payload} ->> 'ministryInvitationId' IN ${ministryInvitationIds})`,
        sql`(${outboxMessage.kind} = 'notification' AND ${outboxMessage.payload} ->> 'kind' = 'ministry_invitation' AND ${outboxMessage.payload} -> 'data' ->> 'ministryInvitationId' IN ${ministryInvitationIds})`,
      );
    }
    if (churchInvitationIds.length > 0) {
      subjects.push(
        sql`(${outboxMessage.kind} = 'invitation.church-bootstrap' AND ${outboxMessage.payload} ->> 'churchInvitationId' IN ${churchInvitationIds})`,
      );
    }
    if (subjects.length === 0) return latest;

    const rows = await getClient({ db: this.db })
      .select()
      .from(outboxMessage)
      .where(and(eq(outboxMessage.churchId, churchId), or(...subjects)))
      .orderBy(desc(outboxMessage.createdAt), desc(outboxMessage.id));

    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const subject =
        row.kind === 'invitation.church-bootstrap'
          ? `church:${payload.churchInvitationId}`
          : `ministry:${
              row.kind === 'notification'
                ? (payload.data as Record<string, unknown> | undefined)
                    ?.ministryInvitationId
                : payload.ministryInvitationId
            }`;
      if (latest.has(subject)) continue;
      latest.set(
        subject,
        projectInvitationEmailDelivery({
          kind: row.kind,
          status: row.status,
          channelOutcomes: row.channelOutcomes as Record<string, string> | null,
          sentAt: row.sentAt,
          emailDeliveredAt: row.emailDeliveredAt,
        }),
      );
    }
    return latest;
  }
}
