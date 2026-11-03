import type { AppConfig } from '@church/app-config';
import { z } from 'zod';
import { ChurchId, MinistryId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IChurchAccessManager } from '../../domain/contracts/application/church-access-manager';
import type { IMinistryMembershipManager } from '../../domain/contracts/application/ministry-membership-manager';
import type { IPeopleListManager } from '../../domain/contracts/application/people-list-manager';
import type { PeopleListScope } from '../../domain/entities/people-list-item';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  churchAccessChangeBodySchema,
  churchAccessChangeResponseSchema,
  endMinistryMembershipResponseSchema,
  ministryMembershipChangeResponseSchema,
  ministryMembershipParamsSchema,
  peopleListQuerystringSchema,
  peopleListResponseSchema,
  personDetailResponseSchema,
  personParamsSchema,
  setMinistryRolesBodySchema,
  upcomingAssignmentsResponseSchema,
} from '../dtos/people-list.dto';
import { refuse } from '../utils/refuse';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** The page size the route's own schema bounds by the configured maximum. */
interface ListLimitQuery {
  limit?: number;
}

interface ResolveScopeInput {
  churchId: ChurchId;
  userId: UserId;
}

interface PeopleControllerDependencies {
  peopleListManager: IPeopleListManager;
  churchAccessManager: IChurchAccessManager;
  ministryMembershipManager: IMinistryMembershipManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  config: Pick<AppConfig, 'people'>;
}

/** The People directory: the Active Church's members within the caller's authority. */
export class PeopleController implements FastifyController {
  readonly prefix = '/people';

  private readonly peopleListManager: IPeopleListManager;
  private readonly churchAccessManager: IChurchAccessManager;
  private readonly ministryMembershipManager: IMinistryMembershipManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;
  private readonly maxPageSize: number;

  constructor({
    peopleListManager,
    churchAccessManager,
    ministryMembershipManager,
    activeChurchResolver,
    authorityGuard,
    config,
  }: PeopleControllerDependencies) {
    this.peopleListManager = peopleListManager;
    this.churchAccessManager = churchAccessManager;
    this.ministryMembershipManager = ministryMembershipManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
    this.maxPageSize = config.people.maxPageSize;
  }

  /** The caller's reach, or undefined without the People capability. A person who is both gets admin behavior. */
  private async resolveScope({
    churchId,
    userId,
  }: ResolveScopeInput): Promise<PeopleListScope | undefined> {
    const { isChurchAdmin, ledMinistries } =
      await this.authorityGuard.resolveCallerCapabilities({ churchId, userId });
    if (isChurchAdmin) return { kind: 'church' };
    if (ledMinistries.length === 0) return undefined;
    return {
      kind: 'ministries',
      ministryIds: ledMinistries.map((m) => MinistryId.from(m.ministryId)),
    };
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );

    app.patch(
      '/:memberId/church-access',
      {
        schema: {
          tags: ['people'],
          operationId: 'changeChurchAccess',
          summary: "Change a member's Church access",
          description:
            'Make a Church Member an admin of the Active Church, or remove their admin access, keeping at least one admin. Only a ChurchAdmin may call it; requesting the current level changes nothing. Church Membership, Ministry Memberships and Roles stay as they are.',
          params: personParamsSchema,
          body: churchAccessChangeBodySchema,
          response: {
            200: churchAccessChangeResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const actorId = UserId.from(request.userId);
        // Refuse a non-admin before any target lookup; the manager rechecks under the Church lock.
        const isAdmin = await this.authorityGuard.canManageChurch({
          churchId,
          userId: actorId,
        });
        if (!isAdmin) return refuse({ reply, request, code: 'FORBIDDEN' });
        const { memberId } = request.params as z.infer<
          typeof personParamsSchema
        >;
        const { accessLevel } = request.body as z.infer<
          typeof churchAccessChangeBodySchema
        >;
        const outcome = await this.churchAccessManager.changeChurchAccess({
          churchId,
          actorId,
          memberId,
          accessLevel,
        });
        if (outcome.kind === 'forbidden') {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        if (outcome.kind === 'not-found') {
          return refuse({ reply, request, code: 'NOT_FOUND' });
        }
        if (outcome.kind === 'last-admin') {
          return refuse({ reply, request, code: 'LAST_CHURCH_ADMIN' });
        }
        const { kind: _applied, ...result } = outcome;
        return reply.send(result);
      },
    );

    app.put(
      '/:memberId/ministry-memberships/:membershipId/roles',
      {
        schema: {
          tags: ['people'],
          operationId: 'setMinistryRoles',
          summary: "Set a Ministry member's Roles",
          description:
            'Replace the complete Role set of one active Ministry Membership; omitted Roles are removed. A ChurchAdmin edits any membership; a Ministry leader edits volunteer-level members of a Ministry they lead and their own. Only active Roles of that Ministry may be added; held archived Roles may be kept or removed. A volunteer-level membership keeps at least one Role. Removing a Role an upcoming Assignment depends on is refused with every such Assignment. The same set changes nothing.',
          params: ministryMembershipParamsSchema,
          body: setMinistryRolesBodySchema,
          response: {
            200: ministryMembershipChangeResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: z.union([
              upcomingAssignmentsResponseSchema,
              errorResponseSchema,
            ]),
            422: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const actorId = UserId.from(request.userId);
        // The area gate; the manager decides the target under the Church lock.
        const scope = await this.resolveScope({ churchId, userId: actorId });
        if (!scope) return refuse({ reply, request, code: 'FORBIDDEN' });
        const { memberId, membershipId } = request.params as z.infer<
          typeof ministryMembershipParamsSchema
        >;
        const { roleIds } = request.body as z.infer<
          typeof setMinistryRolesBodySchema
        >;
        const outcome = await this.ministryMembershipManager.setMinistryRoles({
          churchId,
          actorId,
          memberId,
          membershipId,
          roleIds,
        });
        if (outcome.kind === 'forbidden') {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        if (outcome.kind === 'not-found') {
          return refuse({ reply, request, code: 'NOT_FOUND' });
        }
        const { kind: _applied, ...result } = outcome;
        return reply.send(result);
      },
    );

    app.delete(
      '/:memberId/ministry-memberships/:membershipId',
      {
        schema: {
          tags: ['people'],
          operationId: 'endMinistryMembership',
          summary: 'Remove a member from a Ministry',
          description:
            'End one active Ministry Membership: it becomes inactive with leftAt, keeping its Roles, past Assignments and answers as history, and its actionable AvailabilityChecks are withdrawn. A ChurchAdmin removes anyone; a Ministry leader removes volunteer-level members of a Ministry they lead, never a leader or themselves. Refused while an upcoming Assignment depends on the membership, with every such Assignment. Church Membership, the Volunteer profile and other Ministries are unchanged; rejoining is a new Ministry Invitation.',
          params: ministryMembershipParamsSchema,
          response: {
            200: endMinistryMembershipResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
            409: z.union([
              upcomingAssignmentsResponseSchema,
              errorResponseSchema,
            ]),
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const actorId = UserId.from(request.userId);
        // The area gate; the manager decides the target under the Church lock.
        const scope = await this.resolveScope({ churchId, userId: actorId });
        if (!scope) return refuse({ reply, request, code: 'FORBIDDEN' });
        const { memberId, membershipId } = request.params as z.infer<
          typeof ministryMembershipParamsSchema
        >;
        const outcome =
          await this.ministryMembershipManager.endMinistryMembership({
            churchId,
            actorId,
            memberId,
            membershipId,
          });
        if (outcome.kind === 'forbidden') {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        if (outcome.kind === 'not-found') {
          return refuse({ reply, request, code: 'NOT_FOUND' });
        }
        const { kind: _applied, ...result } = outcome;
        return reply.send(result);
      },
    );

    app.get(
      '/:memberId',
      {
        schema: {
          tags: ['people'],
          operationId: 'getPerson',
          summary: 'Get a person',
          description:
            'One Church Member of the Active Church with their active Ministry cards. A ChurchAdmin sees every card and the Church access facts; a Ministry leader sees only cards of Ministries they lead and no Church access. A missing, other-Church or out-of-scope member id is one 404.',
          params: personParamsSchema,
          response: {
            200: personDetailResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const callerId = UserId.from(request.userId);
        const scope = await this.resolveScope({ churchId, userId: callerId });
        if (!scope) return refuse({ reply, request, code: 'FORBIDDEN' });
        const result = await this.peopleListManager.get({
          churchId,
          scope,
          callerId,
          memberId: (request.params as z.infer<typeof personParamsSchema>)
            .memberId,
        });
        if (!result) return refuse({ reply, request, code: 'NOT_FOUND' });
        const { person, ...capabilities } = result;
        return reply.send({ ...person, ...capabilities });
      },
    );

    app.get(
      '/',
      {
        schema: {
          tags: ['people'],
          operationId: 'listPeople',
          summary: 'List people',
          description:
            "List the Active Church's members ordered by name. A ChurchAdmin sees every member, including those in no Ministry; a Ministry leader sees only members of Ministries they lead, with only those Ministries shown. Search (trimmed, case-insensitive literal name/email substring), Ministry and Access filters combine before pagination.",
          querystring: peopleListQuerystringSchema.extend({
            limit: z.coerce
              .number()
              .int()
              .min(1)
              .max(this.maxPageSize)
              .optional(),
          }),
          response: {
            200: peopleListResponseSchema,
            401: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = ChurchId.from(request.churchId);
        const scope = await this.resolveScope({
          churchId,
          userId: UserId.from(request.userId),
        });
        if (!scope) return refuse({ reply, request, code: 'FORBIDDEN' });
        const { cursor, limit, ...filters } = request.query as z.infer<
          typeof peopleListQuerystringSchema
        > &
          ListLimitQuery;
        return reply.send(
          await this.peopleListManager.list({
            churchId,
            scope,
            filters,
            cursor,
            limit,
          }),
        );
      },
    );
  }
}
