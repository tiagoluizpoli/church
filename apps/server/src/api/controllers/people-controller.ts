import { z } from 'zod';
import { ChurchId, MinistryId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IChurchAccessManager } from '../../domain/contracts/application/church-access-manager';
import type { IPeopleListManager } from '../../domain/contracts/application/people-list-manager';
import type { PeopleListScope } from '../../domain/entities/people-list-item';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  churchAccessChangeBodySchema,
  churchAccessChangeResponseSchema,
  peopleListQuerystringSchema,
  peopleListResponseSchema,
  personDetailResponseSchema,
  personParamsSchema,
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
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  /** Most people one page may ask for (validated central config). */
  maxPageSize: number;
}

/** The People directory: the Active Church's members within the caller's authority. */
export class PeopleController implements FastifyController {
  readonly prefix = '/people';

  private readonly peopleListManager: IPeopleListManager;
  private readonly churchAccessManager: IChurchAccessManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;
  private readonly maxPageSize: number;

  constructor({
    peopleListManager,
    churchAccessManager,
    activeChurchResolver,
    authorityGuard,
    maxPageSize,
  }: PeopleControllerDependencies) {
    this.peopleListManager = peopleListManager;
    this.churchAccessManager = churchAccessManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
    this.maxPageSize = maxPageSize;
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
        const scope = await this.resolveScope({
          churchId,
          userId: UserId.from(request.userId),
        });
        if (!scope) return refuse({ reply, request, code: 'FORBIDDEN' });
        const result = await this.peopleListManager.get({
          churchId,
          scope,
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
