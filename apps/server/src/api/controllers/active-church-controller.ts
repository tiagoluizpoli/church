import { z } from 'zod';
import { ChurchId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IActiveChurchSelectionManager } from '../../domain/contracts/application/active-church-selection-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { requireSession } from '../auth/require-session';
import { resolveActiveChurchAndPersist } from '../auth/resolve-active-church-and-persist';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  type ActiveChurchStatusResponse,
  activeChurchMapper,
  activeChurchStatusResponseSchema,
  churchSelectionListResponseSchema,
  selectActiveChurchBodySchema,
} from '../dtos/active-church.dto';
import {
  authErrorResponses,
  errorResponseSchema,
  sessionErrorResponses,
} from '../dtos/error-response.dto';
import { headersFromRequest } from '../utils/headers';
import { RefusalError } from '../utils/refusal-error';
import type {
  ActiveChurchControllerDependencies,
  BuildStatusResponseInput,
} from './active-church-controller.types';

// The request id doubles as the reference code a Person reads out to support.
const internalErrorResponseSchema = errorResponseSchema.extend({
  requestId: z.string(),
});

export class ActiveChurchController implements FastifyController {
  readonly prefix = '/active-church';

  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly sessionGateway: SessionGateway;
  private readonly selectionManager: IActiveChurchSelectionManager;

  constructor({
    activeChurchResolver,
    sessionGateway,
    selectionManager,
  }: ActiveChurchControllerDependencies) {
    this.activeChurchResolver = activeChurchResolver;
    this.sessionGateway = sessionGateway;
    this.selectionManager = selectionManager;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.get(
      '/status',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'getActiveChurchStatus',
          summary: 'Get the Active Church status',
          description:
            'Resolve the session Active Church, returning its status or a selection_required result when none is set yet.',
          response: {
            200: activeChurchStatusResponseSchema,
            ...sessionErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession({
          sessionGateway: this.sessionGateway,
          request,
        });

        const resolution = await resolveActiveChurchAndPersist({
          resolver: this.activeChurchResolver,
          sessionGateway: this.sessionGateway,
          request,
          userId: session.userId,
          activeOrganizationId: session.activeOrganizationId,
        });
        return reply.send(await this.buildStatusResponse({ resolution }));
      },
    );

    app.get(
      '/options',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'listActiveChurchOptions',
          summary: 'List selectable Churches',
          description:
            'List the Churches the current User holds Church Membership in and may select as their Active Church.',
          response: {
            200: churchSelectionListResponseSchema,
            ...sessionErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession({
          sessionGateway: this.sessionGateway,
          request,
        });

        const options = await this.selectionManager.listSelectableChurches({
          userId: session.userId,
        });
        return reply.send(activeChurchMapper.toSelectionListResponse(options));
      },
    );

    app.post(
      '/select',
      {
        schema: {
          tags: ['active-church'],
          operationId: 'selectActiveChurch',
          summary: 'Select the Active Church',
          description:
            "Set the session's Active Church to a Church the current User holds Church Membership in.",
          body: selectActiveChurchBodySchema,
          response: {
            200: activeChurchStatusResponseSchema,
            ...authErrorResponses,
            500: internalErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const session = await requireSession({
          sessionGateway: this.sessionGateway,
          request,
        });

        const body = request.body;
        const resolution = await this.selectionManager.selectActiveChurch({
          userId: session.userId,
          churchId: ChurchId.from(body.churchId),
        });

        if (resolution.status !== 'resolved') {
          throw new RefusalError({ code: 'FORBIDDEN' });
        }

        // A failed save must reach the standard 500: answering "resolved" would show a Church the session does not scope.
        await this.sessionGateway.setActiveChurch({
          headers: headersFromRequest(request),
          churchId: resolution.churchId,
        });

        return reply.send(await this.buildStatusResponse({ resolution }));
      },
    );
  }

  /**
   * The one status shape both entry-gate routes return. Only a resolved
   * Church has a Church Timezone to look up, so the lookup lives on that
   * branch alone.
   */
  private async buildStatusResponse({
    resolution,
  }: BuildStatusResponseInput): Promise<ActiveChurchStatusResponse> {
    if (resolution.status !== 'resolved') {
      return activeChurchMapper.toUnresolvedStatusResponse({ resolution });
    }
    const timezone = await this.selectionManager.getChurchTimezone({
      churchId: resolution.churchId,
    });
    return activeChurchMapper.toResolvedStatusResponse({
      resolution,
      timezone,
    });
  }
}
