import { z } from 'zod';
import { CycleId, MinistryId, SwapRequestId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ISwapRequestListManager } from '../../domain/contracts/application/swap-request-list-manager';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { assertManagedMinistry } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import { idSchema } from '../dtos/id.dto';
import {
  keepSwapRequestBodySchema,
  leaderSwapRequestsQuerySchema,
  leaderSwapRequestsResponseSchema,
} from '../dtos/swap-request.dto';
import type { SwapRequestListControllerDependencies } from './swap-request-list-controller.types';

/** The leader-facing Swap request read (Spec 28 consumes it). */
export class SwapRequestListController implements FastifyController {
  readonly prefix = '/ministries';

  private readonly swapRequestListManager: ISwapRequestListManager;
  private readonly swapRequestManager: ISwapRequestManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;

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
          params: z.object({ ministryId: idSchema }),
          querystring: leaderSwapRequestsQuerySchema,
          response: {
            200: leaderSwapRequestsResponseSchema,
            ...authErrorResponses,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId } = request.params;
        const { cycleId } = request.query;
        const { churchId } = request;
        // Concealed: no 403 first, so a caller cannot tell a foreign Ministry from a missing one.
        await assertManagedMinistry({
          authorityGuard: this.authorityGuard,
          request,
          ministryId: MinistryId.from(ministryId),
        });
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
          params: z.object({ ministryId: idSchema, swapRequestId: idSchema }),
          body: keepSwapRequestBodySchema,
          response: {
            204: z.null(),
            ...authErrorResponses,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ministryId, swapRequestId } = request.params;
        const body = request.body;
        const { churchId, userId } = request;
        await assertManagedMinistry({
          authorityGuard: this.authorityGuard,
          request,
          ministryId: MinistryId.from(ministryId),
        });
        await this.swapRequestManager.keep({
          churchId,
          userId,
          ministryId: MinistryId.from(ministryId),
          swapRequestId: SwapRequestId.from(swapRequestId),
          reply: body.reply,
        });
        return reply.status(204).send(null);
      },
    );
  }
}
