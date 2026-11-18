import { NotFoundError } from '@church/core';
import { z } from 'zod';
import {
  ChurchId,
  CycleId,
  MinistryId,
  SwapRequestId,
  UserId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { ISwapRequestListManager } from '../../domain/contracts/application/swap-request-list-manager';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  keepSwapRequestBodySchema,
  leaderSwapRequestsQuerySchema,
  leaderSwapRequestsResponseSchema,
} from '../dtos/swap-request.dto';
import { refuse } from '../utils/refuse';

interface SwapRequestListControllerDependencies {
  swapRequestListManager: ISwapRequestListManager;
  swapRequestManager: ISwapRequestManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
}

interface MinistryRouteParams {
  ministryId: string;
}

interface KeepRouteParams extends MinistryRouteParams {
  swapRequestId: string;
}

type LeaderSwapRequestsQuery = z.infer<typeof leaderSwapRequestsQuerySchema>;

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** The leader-facing Swap request read (Spec 28 consumes it). */
export class SwapRequestListController implements FastifyController {
  readonly prefix = '/ministries';

  private readonly swapRequestListManager: ISwapRequestListManager;
  private readonly swapRequestManager: ISwapRequestManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;

  constructor({
    swapRequestListManager,
    swapRequestManager,
    activeChurchResolver,
    authorityGuard,
  }: SwapRequestListControllerDependencies) {
    this.swapRequestListManager = swapRequestListManager;
    this.swapRequestManager = swapRequestManager;
    this.activeChurchResolver = activeChurchResolver;
    this.authorityGuard = authorityGuard;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
      }),
    );

    app.get(
      '/:ministryId/swap-requests',
      {
        schema: {
          tags: ['swap-requests'],
          operationId: 'listMinistrySwapRequests',
          summary: 'List a Ministry’s open Swap requests per Schedule',
          description:
            'Open requests, and expired ones until their Shift ends, grouped by Schedule (Cycle) with the open count per Schedule. Includes the Volunteer’s note, so only the Ministry’s leaders and ChurchAdmins may read it; anyone else gets 404.',
          params: z.object({ ministryId: z.uuid() }),
          querystring: leaderSwapRequestsQuerySchema,
          response: {
            200: leaderSwapRequestsResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params as MinistryRouteParams;
        const { cycleId } = request.query as LeaderSwapRequestsQuery;
        const churchId = ChurchId.from(request.churchId);
        const decision = await this.authorityGuard.decideManageMinistry({
          churchId,
          ministryId: MinistryId.from(ministryId),
          userId: UserId.from(request.userId),
        });
        // Concealed: the caller cannot tell a foreign Ministry from a missing one.
        if (!decision.allowed) {
          return refuse({ reply, request, code: 'NOT_FOUND' });
        }
        return reply.send(
          await this.swapRequestListManager.listForLeader({
            churchId,
            ministryId: MinistryId.from(ministryId),
            cycleId: cycleId ? CycleId.from(cycleId) : undefined,
          }),
        );
      },
    );

    app.post(
      '/:ministryId/swap-requests/:swapRequestId/keep',
      {
        schema: {
          tags: ['swap-requests'],
          operationId: 'keepSwapRequest',
          summary:
            'Keep the Volunteer on the Assignment and answer the request',
          description:
            'Close an open, not-started Swap request as kept, with an optional reply, and tell the Volunteer once. The Assignment is not changed. Only the Ministry’s leaders and ChurchAdmins may; anyone else, or an unknown request, gets 404. 409 when the request is already closed or its Shift has started.',
          params: z.object({ ministryId: z.uuid(), swapRequestId: z.uuid() }),
          body: keepSwapRequestBodySchema,
          response: {
            204: z.null(),
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId, swapRequestId } = request.params as KeepRouteParams;
        const body = request.body as z.infer<typeof keepSwapRequestBodySchema>;
        const churchId = ChurchId.from(request.churchId);
        const userId = UserId.from(request.userId);
        const decision = await this.authorityGuard.decideManageMinistry({
          churchId,
          ministryId: MinistryId.from(ministryId),
          userId,
        });
        if (!decision.allowed) {
          return refuse({ reply, request, code: 'NOT_FOUND' });
        }
        try {
          await this.swapRequestManager.keep({
            churchId,
            userId,
            ministryId: MinistryId.from(ministryId),
            swapRequestId: SwapRequestId.from(swapRequestId),
            reply: body.reply,
          });
          return reply.status(204).send(null);
        } catch (error) {
          if (error instanceof NotFoundError) {
            return refuse({ reply, request, code: 'NOT_FOUND' });
          }
          throw error;
        }
      },
    );
  }
}
