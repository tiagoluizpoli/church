import { z } from 'zod';
import { ChurchId, MinistryId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IPeopleListManager } from '../../domain/contracts/application/people-list-manager';
import type { PeopleListScope } from '../../domain/entities/people-list-item';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
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
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  /** Most people one page may ask for (validated central config). */
  maxPageSize: number;
}

/** The People directory: the Active Church's members within the caller's authority. */
export class PeopleController implements FastifyController {
  readonly prefix = '/people';

  private readonly peopleListManager: IPeopleListManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;
  private readonly maxPageSize: number;

  constructor({
    peopleListManager,
    activeChurchResolver,
    authorityGuard,
    maxPageSize,
  }: PeopleControllerDependencies) {
    this.peopleListManager = peopleListManager;
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
          memberId: request.params.memberId,
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
