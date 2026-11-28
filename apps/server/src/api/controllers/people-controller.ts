import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { RoleId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IChurchAccessManager } from '../../domain/contracts/application/church-access-manager';
import type { IMinistryMembershipManager } from '../../domain/contracts/application/ministry-membership-manager';
import type { IPeopleListManager } from '../../domain/contracts/application/people-list-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import {
  createChurchAdminHook,
  resolveLeadershipScope,
} from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import { pageLimitSchema } from '../dtos/page-limit.dto';
import {
  changeMinistryAccessBodySchema,
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
import { RefusalError } from '../utils/refusal-error';
import { requestCaller } from '../utils/request-caller';
import type {
  PeopleControllerDependencies,
  SendMembershipOutcomeInput,
} from './people-controller.types';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** Maps the shared refusals and sends the applied change without its `kind`. */
function sendMembershipOutcome({
  reply,
  outcome,
}: SendMembershipOutcomeInput): FastifyReply {
  if (outcome.kind === 'forbidden') {
    throw new RefusalError({ code: 'FORBIDDEN' });
  }
  if (outcome.kind === 'not-found') {
    throw new RefusalError({ code: 'NOT_FOUND' });
  }
  const { kind: _applied, ...result } = outcome;
  return reply.send(result);
}

/** The People directory: the Active Church's members within the caller's authority. */
export class PeopleController implements FastifyController {
  readonly prefix = '/people';

  private readonly peopleListManager: IPeopleListManager;
  private readonly churchAccessManager: IChurchAccessManager;
  private readonly ministryMembershipManager: IMinistryMembershipManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;
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

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({ resolver: this.activeChurchResolver }),
    );
    const churchAdminOnly = createChurchAdminHook({
      authorityGuard: this.authorityGuard,
    });

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
        // A non-admin is refused before any target lookup; the manager rechecks under the Church lock.
        preHandler: churchAdminOnly,
      },
      async (request, reply) => {
        const caller = requestCaller({ request });
        const { churchId, userId: actorId } = caller;
        const { memberId } = request.params;
        const { accessLevel } = request.body;
        const outcome = await this.churchAccessManager.changeChurchAccess({
          churchId,
          actorId,
          memberId,
          accessLevel,
        });
        if (outcome.kind === 'forbidden') {
          throw new RefusalError({ code: 'FORBIDDEN' });
        }
        if (outcome.kind === 'not-found') {
          throw new RefusalError({ code: 'NOT_FOUND' });
        }
        if (outcome.kind === 'last-admin') {
          throw new RefusalError({ code: 'LAST_CHURCH_ADMIN' });
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
        const caller = requestCaller({ request });
        const { churchId, userId: actorId } = caller;
        // The area gate; the manager decides the target under the Church lock.
        await resolveLeadershipScope({
          authorityGuard: this.authorityGuard,
          request,
        });
        const { memberId, membershipId } = request.params;
        const { roleIds } = request.body;
        const outcome = await this.ministryMembershipManager.setMinistryRoles({
          churchId,
          actorId,
          memberId,
          membershipId,
          roleIds: roleIds.map(RoleId.from),
        });
        return sendMembershipOutcome({ reply, outcome });
      },
    );

    app.patch(
      '/:memberId/ministry-memberships/:membershipId/access',
      {
        schema: {
          tags: ['people'],
          operationId: 'changeMinistryAccess',
          summary: "Change a member's Ministry Access Level",
          description:
            'Make a member a leader or a volunteer of one Ministry. Only a ChurchAdmin may call it. Promotion keeps Roles; a demotion needs at least one active Role, supplied as the complete roleIds set when the member holds none. Removing a Role an upcoming Assignment depends on refuses the whole operation with every such Assignment. The level and Roles save together under one audit; the current state changes nothing. Church access and other memberships stay as they are.',
          params: ministryMembershipParamsSchema,
          body: changeMinistryAccessBodySchema,
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
        // A non-admin is refused before any target lookup; the manager rechecks under the Church lock.
        preHandler: churchAdminOnly,
      },
      async (request, reply) => {
        const caller = requestCaller({ request });
        const { churchId, userId: actorId } = caller;
        const { memberId, membershipId } = request.params;
        const { accessLevel, roleIds } = request.body;
        const outcome =
          await this.ministryMembershipManager.changeMinistryAccess({
            churchId,
            actorId,
            memberId,
            membershipId,
            accessLevel,
            roleIds: roleIds?.map(RoleId.from),
          });
        return sendMembershipOutcome({ reply, outcome });
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
        const caller = requestCaller({ request });
        const { churchId, userId: actorId } = caller;
        // The area gate; the manager decides the target under the Church lock.
        await resolveLeadershipScope({
          authorityGuard: this.authorityGuard,
          request,
        });
        const { memberId, membershipId } = request.params;
        const outcome =
          await this.ministryMembershipManager.endMinistryMembership({
            churchId,
            actorId,
            memberId,
            membershipId,
          });
        return sendMembershipOutcome({ reply, outcome });
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
        const caller = requestCaller({ request });
        const { churchId, userId: callerId, actor: callerActor } = caller;
        const scope = await resolveLeadershipScope({
          authorityGuard: this.authorityGuard,
          request,
        });
        const result = await this.peopleListManager.get({
          churchId,
          scope,
          callerId,
          callerActor,
          memberId: request.params.memberId,
        });
        if (!result) throw new RefusalError({ code: 'NOT_FOUND' });
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
            "List the Active Church's members ordered by name. A ChurchAdmin sees every member, including those in no Ministry; a Ministry leader sees only members of Ministries they lead, with only those Ministries shown. Search (trimmed, case-insensitive literal name/email substring), Ministry, Access and `withoutMinistry` filters combine before pagination; `withoutMinistry=true` keeps exactly the members `counts.withoutMinistry` counts, so combined with `ministryId` or a leader/volunteer `access` it matches nobody. `counts` covers the caller's whole scope: it ignores the filters and the cursor, so every page repeats the same values. `leaders`/`volunteers` count members with an active membership at that level in a visible Ministry (one person can be both); `withoutMinistry` counts members with none, so it is always 0 for a leader.",
          querystring: peopleListQuerystringSchema.extend({
            limit: pageLimitSchema({
              maxPageSize: this.maxPageSize,
            }).optional(),
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
        const caller = requestCaller({ request });
        const { churchId } = caller;
        const scope = await resolveLeadershipScope({
          authorityGuard: this.authorityGuard,
          request,
        });
        const { cursor, limit, ...filters } = request.query;
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
