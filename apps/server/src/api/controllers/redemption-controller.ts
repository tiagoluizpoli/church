import 'reflect-metadata';
import { env } from '@church/env/server';
import { injectable } from 'tsyringe';
import type { z } from 'zod';
import { MinistryInvitationId } from '../../domain/branded-ids';
import type { RedemptionManager } from '../../domain/contracts/application/redemption-manager';
import { VerificationCodeError } from '../../domain/errors/verification-code-error';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  debugVerificationCodeResponseSchema,
  rateLimitedResponseSchema,
  redeemNewUserBodySchema,
  redemptionOutcomeResponseSchema,
  redemptionParamsSchema,
  redemptionPreviewResponseSchema,
  unavailableRedemptionResponseSchema,
  verificationCodeRequestedResponseSchema,
} from '../dtos/redemption.dto';

type RedemptionParams = z.infer<typeof redemptionParamsSchema>;
type RedeemNewUserBody = z.infer<typeof redeemNewUserBodySchema>;

export interface RedemptionControllerDependencies {
  redemptionManager: RedemptionManager;
}

interface RateLimitInput {
  key: string;
  now?: number;
}

const publicRateLimit = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;

@injectable()
export class RedemptionController implements FastifyController {
  readonly prefix = '/redemption';

  constructor({ redemptionManager }: RedemptionControllerDependencies) {
    this.redemptionManager = redemptionManager;
  }

  private readonly redemptionManager: RedemptionManager;

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.get(
      '/church/:invitationId',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'previewChurchInvitation',
          params: redemptionParamsSchema,
          response: {
            200: redemptionPreviewResponseSchema,
            404: unavailableRedemptionResponseSchema,
            429: rateLimitedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (isRateLimited({ key: request.ip }))
          return reply.status(429).send({ error: 'RATE_LIMITED' });
        const params = request.params as RedemptionParams;
        const preview = await this.redemptionManager.getPublicPreview({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
        });
        if (!preview)
          return reply.status(404).send({ error: 'INVITATION_UNAVAILABLE' });
        return reply.send({
          email: preview.email,
          churchName: preview.churchName,
          ministryName: preview.ministryName,
          ministryAccessLevel: preview.ministryAccessLevel,
          roleNames: preview.roleNames,
          expiresAt: preview.expiresAt.toISOString(),
        });
      },
    );

    app.post(
      '/church/:invitationId/code',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'requestChurchInvitationVerificationCode',
          params: redemptionParamsSchema,
          response: {
            200: verificationCodeRequestedResponseSchema,
            404: unavailableRedemptionResponseSchema,
            429: rateLimitedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (isRateLimited({ key: request.ip }))
          return reply.status(429).send({ error: 'RATE_LIMITED' });
        const params = request.params as RedemptionParams;
        let sent: boolean;
        try {
          sent = await this.redemptionManager.requestVerificationCode({
            ministryInvitationId: MinistryInvitationId.from(
              params.invitationId,
            ),
          });
        } catch (error) {
          if (error instanceof VerificationCodeError) {
            return reply.status(429).send({ error: 'RATE_LIMITED' });
          }
          throw error;
        }
        if (!sent)
          return reply.status(404).send({ error: 'INVITATION_UNAVAILABLE' });
        return reply.send({ status: 'sent' });
      },
    );

    app.post(
      '/church/:invitationId/redeem',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'redeemChurchInvitation',
          params: redemptionParamsSchema,
          body: redeemNewUserBodySchema,
          response: {
            200: redemptionOutcomeResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const params = request.params as RedemptionParams;
        const body = request.body as RedeemNewUserBody;
        const outcome = await this.redemptionManager.redeemNewUser({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
          name: body.name,
          password: body.password,
          code: body.code,
          idempotencyKey: body.idempotencyKey,
        });
        if (outcome.kind === 'full-success') {
          reply.header('set-cookie', outcome.sessionCookie);
          return reply.send({
            kind: outcome.kind,
            volunteerId: outcome.volunteerId,
          });
        }
        return reply.send(outcome);
      },
    );

    if (env.NODE_ENV !== 'production') {
      app.get(
        '/church/:invitationId/debug-code',
        {
          schema: {
            tags: ['redemption-debug'],
            operationId: 'debugGetChurchInvitationVerificationCode',
            params: redemptionParamsSchema,
            response: {
              200: debugVerificationCodeResponseSchema,
              404: unavailableRedemptionResponseSchema,
            },
          },
        },
        async (request, reply) => {
          const params = request.params as RedemptionParams;
          const code = await this.redemptionManager.getDebugVerificationCode({
            ministryInvitationId: MinistryInvitationId.from(
              params.invitationId,
            ),
          });
          if (!code)
            return reply.status(404).send({ error: 'INVITATION_UNAVAILABLE' });
          return reply.send({ code });
        },
      );
    }
  }
}

function isRateLimited({ key, now = Date.now() }: RateLimitInput): boolean {
  const attempts = (publicRateLimit.get(key) ?? []).filter(
    (attempt) => attempt > now - RATE_WINDOW_MS,
  );
  attempts.push(now);
  publicRateLimit.set(key, attempts);
  return attempts.length > RATE_MAX_REQUESTS;
}
