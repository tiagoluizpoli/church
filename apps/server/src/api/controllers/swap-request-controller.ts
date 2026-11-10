import { NotFoundError } from '@church/core';
import { z } from 'zod';
import { AssignmentId, ChurchId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { ISwapRequestManager } from '../../domain/contracts/application/swap-request-manager';
import { AssignmentAccessDeniedError } from '../../domain/errors/assignment-access-denied';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  raiseSwapRequestBodySchema,
  swapRequestResponseSchema,
} from '../dtos/swap-request.dto';
import { refuse } from '../utils/refuse';

interface SwapRequestControllerDependencies {
  swapRequestManager: ISwapRequestManager;
  activeChurchResolver: IActiveChurchResolver;
}

interface AssignmentRouteParams {
  assignmentId: string;
}

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export class SwapRequestController implements FastifyController {
  readonly prefix = '/volunteer';

  private readonly swapRequestManager: ISwapRequestManager;
  private readonly activeChurchResolver: IActiveChurchResolver;

  constructor({
    swapRequestManager,
    activeChurchResolver,
  }: SwapRequestControllerDependencies) {
    this.swapRequestManager = swapRequestManager;
    this.activeChurchResolver = activeChurchResolver;
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
        requireVolunteer: true,
      }),
    );

    app.post(
      '/assignments/:assignmentId/swap-requests',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'raiseSwapRequest',
          summary: 'Raise a swap request on one of the caller’s Assignments',
          description:
            'Ask the leader to change one of the current Volunteer’s own published, not-started Assignments. The Assignment is not changed. Anyone else’s, or an unknown one, is 404.',
          body: raiseSwapRequestBodySchema,
          response: {
            201: swapRequestResponseSchema,
            400: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const body = request.body as z.infer<typeof raiseSwapRequestBodySchema>;
        try {
          const raised = await this.swapRequestManager.raise({
            churchId: ChurchId.from(request.churchId),
            userId: UserId.from(request.userId),
            assignmentId: AssignmentId.from(assignmentId),
            note: body.note,
          });
          return reply.status(201).send(raised);
        } catch (error) {
          if (
            error instanceof AssignmentAccessDeniedError ||
            error instanceof NotFoundError
          ) {
            return refuse({ reply, request, code: 'NOT_FOUND' });
          }
          throw error;
        }
      },
    );

    app.delete(
      '/assignments/:assignmentId/swap-requests/current',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'withdrawSwapRequest',
          summary:
            'Withdraw the open swap request on one of the caller’s Assignments',
          description:
            'Close the caller’s open swap request as withdrawn. The Assignment is not changed and nobody is notified. 409 when the request is already closed.',
          response: {
            204: z.null(),
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        try {
          await this.swapRequestManager.withdraw({
            churchId: ChurchId.from(request.churchId),
            userId: UserId.from(request.userId),
            assignmentId: AssignmentId.from(assignmentId),
          });
          return reply.status(204).send(null);
        } catch (error) {
          if (
            error instanceof AssignmentAccessDeniedError ||
            error instanceof NotFoundError
          ) {
            return refuse({ reply, request, code: 'NOT_FOUND' });
          }
          throw error;
        }
      },
    );
  }
}
