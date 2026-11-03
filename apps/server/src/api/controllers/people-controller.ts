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
        const { isChurchAdmin, ledMinistries } =
          await this.authorityGuard.resolveCallerCapabilities({
            churchId,
            userId: UserId.from(request.userId),
          });
        if (!isChurchAdmin && ledMinistries.length === 0) {
          return refuse({ reply, request, code: 'FORBIDDEN' });
        }
        // A person who is both gets admin behavior.
        const scope: PeopleListScope = isChurchAdmin
          ? { kind: 'church' }
          : {
              kind: 'ministries',
              ministryIds: ledMinistries.map((m) =>
                MinistryId.from(m.ministryId),
              ),
            };
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
