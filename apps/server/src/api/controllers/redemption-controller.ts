import 'reflect-metadata';
import { auth } from '@church/auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import type { z } from 'zod';
import { MinistryInvitationId, UserId } from '../../domain/branded-ids';
import type { RedemptionManager } from '../../domain/contracts/application/redemption-manager';
import { VerificationCodeError } from '../../domain/errors/verification-code-error';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  acceptExistingMemberBodySchema,
  authenticatedInvitationStatusResponseSchema,
  debugVerificationCodeResponseSchema,
  declineOutcomeResponseSchema,
  existingMemberOutcomeResponseSchema,
  rateLimitedResponseSchema,
  redeemNewUserBodySchema,
  redemptionOutcomeResponseSchema,
  redemptionParamsSchema,
  redemptionPreviewResponseSchema,
  unauthorizedResponseSchema,
  unavailableRedemptionResponseSchema,
  verificationCodeRequestedResponseSchema,
} from '../dtos/redemption.dto';
import { debugEndpointsEnabled } from '../utils/debug-endpoints';
import { headersFromRequest } from '../utils/headers';

type RedemptionParams = z.infer<typeof redemptionParamsSchema>;
type RedeemNewUserBody = z.infer<typeof redeemNewUserBodySchema>;
type AcceptExistingMemberBody = z.infer<typeof acceptExistingMemberBodySchema>;

interface AuthenticatedRedeemer {
  userId: ReturnType<typeof UserId.from>;
  /** The caller's own cookie header, forwarded as-is to Better Auth — never minted here. */
  sessionCookie: string;
}

interface RequireRedeemerInput {
  request: FastifyRequest;
  reply: FastifyReply;
}

/** The restricted preview field set both the chained and existing-member routes expose (spec §7.1). */
interface InvitationPreviewFields {
  email: string;
  churchName: string;
  ministryName: string;
  ministryAccessLevel: 'volunteer' | 'leader';
  roleNames: string[];
  expiresAt: Date;
}

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
        return reply.send(toInvitationPreviewFields(preview));
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

    app.post(
      '/church/:invitationId/decline',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'declineChurchInvitation',
          params: redemptionParamsSchema,
          response: {
            200: declineOutcomeResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      this.handleDecline.bind(this),
    );

    app.get(
      '/ministry/:invitationId',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'getMinistryInvitationStatus',
          params: redemptionParamsSchema,
          response: {
            200: authenticatedInvitationStatusResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request, reply });
        if (!redeemer) return;
        const params = request.params as RedemptionParams;
        const status =
          await this.redemptionManager.getAuthenticatedInvitationStatus({
            ministryInvitationId: MinistryInvitationId.from(
              params.invitationId,
            ),
            userId: redeemer.userId,
          });
        if (status.kind === 'redeemable') {
          return reply.send({
            kind: status.kind,
            ...toInvitationPreviewFields(status),
          });
        }
        return reply.send(status);
      },
    );

    app.post(
      '/ministry/:invitationId/accept',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'acceptMinistryInvitation',
          params: redemptionParamsSchema,
          body: acceptExistingMemberBodySchema,
          response: {
            200: existingMemberOutcomeResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request, reply });
        if (!redeemer) return;
        const params = request.params as RedemptionParams;
        const body = request.body as AcceptExistingMemberBody;
        const outcome = await this.redemptionManager.acceptExistingMember({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
          userId: redeemer.userId,
          sessionCookie: redeemer.sessionCookie,
          idempotencyKey: body.idempotencyKey,
        });
        return reply.send(outcome);
      },
    );

    app.post(
      '/ministry/:invitationId/decline',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'declineMinistryInvitation',
          params: redemptionParamsSchema,
          response: {
            200: declineOutcomeResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      this.handleDecline.bind(this),
    );

    if (debugEndpointsEnabled()) {
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

  /**
   * Shared by `/church/:invitationId/decline` and `/ministry/:invitationId/decline`
   * — the invitation's own `kind`, not the URL used to reach it, decides
   * whether the chained pair is rejected alongside it (spec §7.3).
   */
  private async handleDecline(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const redeemer = await this.requireRedeemer({ request, reply });
    if (!redeemer) return;
    const params = request.params as RedemptionParams;
    const outcome = await this.redemptionManager.declineInvitation({
      ministryInvitationId: MinistryInvitationId.from(params.invitationId),
      userId: redeemer.userId,
      sessionCookie: redeemer.sessionCookie,
    });
    reply.send(outcome);
  }

  /**
   * Every existing-member lifecycle route needs an authenticated User but no
   * Active Church — unlike `createActiveChurchPreValidation`, the intended
   * Church may not be active (or membered) yet. Forwards the raw cookie
   * header as-is, matching how the identity gateway forwards it to Better
   * Auth for `acceptChurchInvitation` / `rejectChurchInvitation`.
   */
  private async requireRedeemer({
    request,
    reply,
  }: RequireRedeemerInput): Promise<AuthenticatedRedeemer | null> {
    const headers = headersFromRequest(request);
    const session = await auth.api.getSession({ headers }).catch(() => null);
    const sessionCookie = request.headers.cookie;
    if (!session?.user || !sessionCookie) {
      await reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      return null;
    }
    return { userId: UserId.from(session.user.id), sessionCookie };
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

/** Shared by the chained and existing-member previews — both expose the same restricted field set (spec §7.1). */
function toInvitationPreviewFields(preview: InvitationPreviewFields) {
  return {
    email: preview.email,
    churchName: preview.churchName,
    ministryName: preview.ministryName,
    ministryAccessLevel: preview.ministryAccessLevel,
    roleNames: preview.roleNames,
    expiresAt: preview.expiresAt.toISOString(),
  };
}
