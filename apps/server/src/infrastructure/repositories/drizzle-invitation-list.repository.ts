import {
  invitation as churchInvitation,
  identityAudit,
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
  ilike,
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
  ListInvitationsInput,
} from '../../domain/contracts/infrastructure/invitation-list.repository';
import type {
  InvitationClosure,
  InvitationEmailDelivery,
  InvitationListFilters,
  InvitationListKind,
  InvitationListOptions,
  InvitationListRole,
  InvitationListRow,
  InvitationListRowsPage,
  InvitationListScope,
} from '../../domain/entities/invitation-list-item';
import { MinistryInvitationNotFoundError } from '../../domain/errors/ministry-invitation-not-found';
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
  filters: InvitationListFilters;
  now: Date;
}

interface MinistryQueryInput extends KindQueryInput {
  ministryIds?: string[];
}

interface DeliveryFacts {
  latest: Map<string, InvitationEmailDelivery>;
  lastSent: Map<string, Date>;
}

interface DeliveryLookupInput {
  churchId: string;
  ministryInvitationIds: string[];
  churchInvitationIds: string[];
  /** Ministry row id → its paired Church Invitation, whose T1 may deliver it. */
  pairedParents: Map<string, string>;
}

/** Filter words onto the storage words of both tables; `expired` is stored pending, narrowed by the clock. */
const STORED_STATUS = {
  pending: 'pending',
  expired: 'pending',
  accepted: 'accepted',
  declined: 'rejected',
  revoked: 'canceled',
} as const;

const DISPLAY_STATUS = {
  accepted: 'accepted',
  rejected: 'declined',
  canceled: 'revoked',
} as const;

/** Escape LIKE wildcards so the address is matched literally. */
function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

const inviter = alias(user, 'inviter');
const invitee = alias(user, 'invitee');

interface FilterOptionsInput {
  churchId: string;
  scope: InvitationListScope;
}

interface ClosuresInput {
  churchId: string;
  rows: { kind: InvitationListKind; id: string; closureFacts: ClosureFacts }[];
}

type ChurchStatus = 'pending' | 'accepted' | 'rejected' | 'canceled';

/** What the row itself recorded about its closure; the audit trail adds the Ministry-side actor. */
interface ClosureFacts {
  status: ChurchStatus;
  at?: Date;
  actorId?: string;
  reason?: string;
}

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

  async list({
    churchId,
    scope,
    filters,
    cursor,
    limit,
    now,
  }: ListInvitationsInput): Promise<InvitationListRowsPage> {
    const position = cursor
      ? decodeInvitationListCursor({ cursor })
      : undefined;
    if (cursor && !position) throw new Error('Invalid invitation cursor');

    const isAdmin = scope.kind === 'church';
    const options = await this.filterOptions({ churchId, scope });
    // One answer for missing, archived, foreign and unmanaged Ministries.
    if (
      filters.ministryId &&
      !options.ministries.some(({ id }) => id === filters.ministryId)
    ) {
      throw new MinistryInvitationNotFoundError();
    }
    const ministryIds = isAdmin ? undefined : scope.ministryIds;
    if (ministryIds?.length === 0) return { items: [], options };

    const query = { churchId, limit: limit + 1, position, filters, now };
    const wantsMinistryRows = filters.invitedAs !== 'admin';
    // Standalone admin grants are never visible to a Ministry leader, and carry no Ministry.
    const wantsChurchRows =
      isAdmin &&
      !filters.ministryId &&
      (!filters.invitedAs || filters.invitedAs === 'admin');
    const [ministryRows, churchRows] = await Promise.all([
      wantsMinistryRows ? this.ministryOffers({ ...query, ministryIds }) : [],
      wantsChurchRows ? this.adminChurchGrants(query) : [],
    ]);

    const merged = [...ministryRows, ...churchRows]
      .sort((a, b) => (isBefore({ a, b }) ? -1 : 1))
      .slice(0, limit + 1);
    const page = merged.slice(0, limit);

    const ministryPage = page.filter((row) => row.kind === 'ministry');
    const [roles, { latest: deliveries, lastSent }, closures] =
      await Promise.all([
        this.rolesByInvitation({ ids: ministryPage.map((r) => r.id) }),
        this.latestDeliveries({
          churchId,
          ministryInvitationIds: ministryPage.map((row) => row.id),
          churchInvitationIds: page
            .filter((row) => row.kind === 'church')
            .map((row) => row.id),
          pairedParents: new Map(
            ministryPage.flatMap((row) =>
              row.churchInvitationId ? [[row.id, row.churchInvitationId]] : [],
            ),
          ),
        }),
        this.closures({ churchId, rows: page }),
      ]);

    const items: InvitationListRow[] = page.map(
      ({ closureFacts: _facts, ...row }) => ({
        ...row,
        // A leader must not learn the Church-wide grant behind a paired offer.
        churchInvitationId: isAdmin ? row.churchInvitationId : undefined,
        churchAccessLevel: isAdmin ? row.churchAccessLevel : undefined,
        roles: roles.get(row.id) ?? [],
        displayStatus:
          row.status === 'pending'
            ? row.expiresAt.getTime() <= now.getTime()
              ? 'expired'
              : 'pending'
            : DISPLAY_STATUS[row.status],
        closure: closures.get(`${row.kind}:${row.id}`),
        emailDelivery: deliveries.get(`${row.kind}:${row.id}`) ?? {
          state: 'unavailable',
        },
        lastSentAt: lastSent.get(`${row.kind}:${row.id}`),
      }),
    );
    const last = items.at(-1);
    return {
      items,
      options,
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

  /** The Ministries the caller may filter by (active only) and the grant types they may see. */
  private async filterOptions({
    churchId,
    scope,
  }: FilterOptionsInput): Promise<InvitationListOptions> {
    const isAdmin = scope.kind === 'church';
    const ministries = await getClient({ db: this.db })
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
    return {
      ministries,
      invitedAs: isAdmin
        ? ['admin', 'leader', 'volunteer']
        : ['leader', 'volunteer'],
    };
  }

  /** Who closed each page row and when, from the audit trail where it exists and the recorded stamps otherwise. */
  private async closures({
    churchId,
    rows,
  }: ClosuresInput): Promise<Map<string, InvitationClosure>> {
    const closed = rows.filter((row) => row.closureFacts.status !== 'pending');
    const ministryClosed = closed.filter((row) => row.kind === 'ministry');
    const audits = new Map<
      string,
      { actorId: string; at: Date; reason: string | null }
    >();
    if (ministryClosed.length > 0) {
      const auditRows = await getClient({ db: this.db })
        .select({
          invitationId: identityAudit.ministryInvitationId,
          action: identityAudit.action,
          actorId: identityAudit.actorId,
          at: identityAudit.timestamp,
          reason: identityAudit.reason,
        })
        .from(identityAudit)
        .where(
          and(
            eq(identityAudit.churchId, churchId),
            inArray(
              identityAudit.ministryInvitationId,
              ministryClosed.map((row) => row.id),
            ),
            inArray(identityAudit.action, [
              'acceptance',
              'ministry_acceptance',
              'decline',
            ]),
          ),
        )
        .orderBy(desc(identityAudit.timestamp), desc(identityAudit.id));
      for (const audit of auditRows) {
        const row = ministryClosed.find((r) => r.id === audit.invitationId);
        const wanted =
          row?.closureFacts.status === 'rejected' ? 'decline' : null;
        const isDecline = audit.action === 'decline';
        if (!row || (wanted ? !isDecline : isDecline)) continue;
        if (!audits.has(audit.invitationId as string)) {
          audits.set(audit.invitationId as string, audit);
        }
      }
    }

    const actorIds = new Set<string>();
    for (const row of closed) {
      const audit = row.kind === 'ministry' ? audits.get(row.id) : undefined;
      const id = audit?.actorId ?? row.closureFacts.actorId;
      if (id) actorIds.add(id);
    }
    const names = new Map<string, string>();
    if (actorIds.size > 0) {
      const users = await getClient({ db: this.db })
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, [...actorIds]));
      for (const found of users) names.set(found.id, found.name);
    }

    const result = new Map<string, InvitationClosure>();
    for (const row of closed) {
      const audit = row.kind === 'ministry' ? audits.get(row.id) : undefined;
      const actorId = audit?.actorId ?? row.closureFacts.actorId;
      const at = audit?.at ?? row.closureFacts.at;
      const actorName = actorId ? names.get(actorId) : undefined;
      result.set(`${row.kind}:${row.id}`, {
        actor:
          actorId && actorName ? { id: actorId, name: actorName } : undefined,
        at: at ?? undefined,
        reason: audit?.reason ?? row.closureFacts.reason,
      });
    }
    return result;
  }

  private async ministryOffers({
    churchId,
    limit,
    position,
    ministryIds,
    filters,
    now,
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
        churchStatus: churchInvitation.status,
        inviterId: inviter.id,
        inviterName: inviter.name,
        createdAt: ministryInvitation.createdAt,
        expiresAt: ministryInvitation.expiresAt,
        status: ministryInvitation.status,
        acceptedAt: ministryInvitation.acceptedAt,
        declinedAt: ministryInvitation.declinedAt,
        canceledAt: ministryInvitation.canceledAt,
        canceledById: ministryInvitation.canceledById,
        cancelReason: ministryInvitation.cancelReason,
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
          eq(ministryInvitation.status, STORED_STATUS[filters.status]),
          filters.status === 'expired'
            ? lte(ministryInvitation.expiresAt, now)
            : undefined,
          // Outstanding offers die with their Ministry; its history stays readable.
          filters.status === 'pending' || filters.status === 'expired'
            ? isNull(ministry.deletedAt)
            : undefined,
          ministryIds
            ? inArray(ministryInvitation.ministryId, ministryIds)
            : undefined,
          filters.ministryId
            ? eq(ministryInvitation.ministryId, filters.ministryId)
            : undefined,
          filters.invitedAs && filters.invitedAs !== 'admin'
            ? eq(ministryInvitation.ministryAccessLevel, filters.invitedAs)
            : undefined,
          filters.email
            ? ilike(
                sql`COALESCE(${invitee.email}, ${churchInvitation.email})`,
                containsPattern(filters.email),
              )
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
      parentPending:
        row.churchStatus === null || row.churchStatus === 'pending',
      ministryAccessLevel: row.ministryAccessLevel,
      invitedBy: { id: row.inviterId, name: row.inviterName },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: row.status,
      closureFacts: {
        status: row.status,
        at:
          (row.status === 'accepted' && row.acceptedAt) ||
          (row.status === 'rejected' && row.declinedAt) ||
          (row.status === 'canceled' && row.canceledAt) ||
          undefined,
        ...(row.status === 'canceled'
          ? {
              actorId: row.canceledById ?? undefined,
              reason: row.cancelReason ?? undefined,
            }
          : {}),
      } satisfies ClosureFacts,
    }));
  }

  private async adminChurchGrants({
    churchId,
    limit,
    position,
    filters,
    now,
  }: KindQueryInput) {
    const rows = await getClient({ db: this.db })
      .select({
        id: churchInvitation.id,
        email: churchInvitation.email,
        inviterId: inviter.id,
        inviterName: inviter.name,
        createdAt: churchInvitation.createdAt,
        expiresAt: churchInvitation.expiresAt,
        status: churchInvitation.status,
        acceptedAt: churchInvitation.acceptedAt,
        acceptedById: churchInvitation.acceptedById,
        declinedAt: churchInvitation.declinedAt,
        declinedById: churchInvitation.declinedById,
        canceledAt: churchInvitation.canceledAt,
        canceledById: churchInvitation.canceledById,
        cancelReason: churchInvitation.cancelReason,
      })
      .from(churchInvitation)
      .innerJoin(inviter, eq(inviter.id, churchInvitation.inviterId))
      .where(
        and(
          eq(churchInvitation.organizationId, churchId),
          eq(churchInvitation.status, STORED_STATUS[filters.status]),
          filters.status === 'expired'
            ? lte(churchInvitation.expiresAt, now)
            : undefined,
          eq(churchInvitation.role, 'admin'),
          filters.email
            ? ilike(churchInvitation.email, containsPattern(filters.email))
            : undefined,
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
      parentPending: true,
      ministryAccessLevel: undefined,
      invitedBy: { id: row.inviterId, name: row.inviterName },
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      status: row.status as ChurchStatus,
      closureFacts: {
        status: row.status as ChurchStatus,
        ...(row.status === 'accepted'
          ? {
              at: row.acceptedAt ?? undefined,
              actorId: row.acceptedById ?? undefined,
            }
          : row.status === 'rejected'
            ? {
                at: row.declinedAt ?? undefined,
                actorId: row.declinedById ?? undefined,
              }
            : row.status === 'canceled'
              ? {
                  at: row.canceledAt ?? undefined,
                  actorId: row.canceledById ?? undefined,
                  reason: row.cancelReason ?? undefined,
                }
              : {}),
      } satisfies ClosureFacts,
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

  /**
   * The latest outbox row per offer and, apart from it, the latest send the
   * sender actually confirmed (a later failed attempt does not erase it),
   * keyed `<kind>:<id>`; an offer with none is absent.
   */
  private async latestDeliveries({
    churchId,
    ministryInvitationIds,
    churchInvitationIds,
    pairedParents,
  }: DeliveryLookupInput): Promise<DeliveryFacts> {
    const latest = new Map<string, InvitationEmailDelivery>();
    const lastSent = new Map<string, Date>();
    const subjects: SQL[] = [];
    if (ministryInvitationIds.length > 0) {
      subjects.push(
        sql`(${outboxMessage.kind} = 'invitation.chained' AND ${outboxMessage.payload} ->> 'ministryInvitationId' IN ${ministryInvitationIds})`,
        sql`(${outboxMessage.kind} = 'notification' AND ${outboxMessage.payload} ->> 'kind' = 'ministry_invitation' AND ${outboxMessage.payload} -> 'data' ->> 'ministryInvitationId' IN ${ministryInvitationIds})`,
      );
    }
    const offerIds = [
      ...new Set([...churchInvitationIds, ...pairedParents.values()]),
    ];
    if (offerIds.length > 0) {
      subjects.push(
        sql`(${outboxMessage.kind} = 'invitation.church-bootstrap' AND ${outboxMessage.payload} ->> 'churchInvitationId' IN ${offerIds})`,
      );
    }
    if (subjects.length === 0) return { latest, lastSent };

    const rows = await getClient({ db: this.db })
      .select()
      .from(outboxMessage)
      .where(and(eq(outboxMessage.churchId, churchId), or(...subjects)))
      .orderBy(desc(outboxMessage.createdAt), desc(outboxMessage.id));

    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      // An admin-upgraded pair's halves are delivered by the offer's one T1.
      const subjects =
        row.kind === 'invitation.church-bootstrap'
          ? [
              `church:${payload.churchInvitationId}`,
              ...[...pairedParents]
                .filter(([, parent]) => parent === payload.churchInvitationId)
                .map(([halfId]) => `ministry:${halfId}`),
            ]
          : [
              `ministry:${
                row.kind === 'notification'
                  ? (payload.data as Record<string, unknown> | undefined)
                      ?.ministryInvitationId
                  : payload.ministryInvitationId
              }`,
            ];
      const delivery = projectInvitationEmailDelivery({
        kind: row.kind,
        status: row.status,
        channelOutcomes: row.channelOutcomes as Record<string, string> | null,
        sentAt: row.sentAt,
        emailDeliveredAt: row.emailDeliveredAt,
      });
      for (const subject of subjects) {
        if (!latest.has(subject)) latest.set(subject, delivery);
        if (
          delivery.state === 'sent' &&
          delivery.sentAt &&
          !lastSent.has(subject)
        )
          lastSent.set(subject, delivery.sentAt);
      }
    }
    return { latest, lastSent };
  }
}
