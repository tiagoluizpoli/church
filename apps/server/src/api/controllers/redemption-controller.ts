import 'reflect-metadata';
import { auth } from '@church/auth';
import { fromDate } from '@church/time';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { injectable } from 'tsyringe';
import type { z } from 'zod';
import { MinistryInvitationId, UserId } from '../../domain/branded-ids';
import type { RedemptionManager } from '../../domain/contracts/application/redemption-manager';
import type { VolunteerTransferManager } from '../../domain/contracts/application/volunteer-transfer-manager';
import { VerificationCodeError } from '../../domain/errors/verification-code-error';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  acceptExistingMemberBodySchema,
  authenticatedInvitationStatusResponseSchema,
  confirmTransferBodySchema,
  confirmTransferOutcomeResponseSchema,
  debugVerificationCodeResponseSchema,
  declineOutcomeResponseSchema,
  existingMemberOutcomeResponseSchema,
  rateLimitedResponseSchema,
  redeemNewUserBodySchema,
  redemptionOutcomeResponseSchema,
  redemptionParamsSchema,
  redemptionPreviewResponseSchema,
  transferPreviewResponseSchema,
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
  volunteerTransferManager: VolunteerTransferManager;
}

type ConfirmTransferBody = z.infer<typeof confirmTransferBodySchema>;

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

  constructor({
    redemptionManager,
    volunteerTransferManager,
  }: RedemptionControllerDependencies) {
    this.redemptionManager = redemptionManager;
    this.volunteerTransferManager = volunteerTransferManager;
  }

  private readonly redemptionManager: RedemptionManager;
  private readonly volunteerTransferManager: VolunteerTransferManager;

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
          summary: 'Preview a Church Invitation',
          description:
            'Get the public, unauthenticated preview of a Church Invitation for an unregistered recipient.',
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
          summary: 'Request a Church Invitation verification code',
          description:
            "Send a one-time verification code to the invited recipient's email so they can redeem their Church Invitation.",
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
          summary: 'Redeem a Church Invitation as a new User',
          description:
            'Verify the code and create a new User account that redeems a Church Invitation, admitting it as a Church Member.',
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
          summary: 'Decline a Church Invitation',
          description:
            'Decline a Church Invitation as its authenticated recipient, also declining a chained Ministry Invitation if one is paired with it.',
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
          summary: 'Get a Ministry Invitation status',
          description:
            "Get an authenticated User's redeemable status and preview for a Ministry Invitation.",
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
            invitationKind: status.invitationKind,
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
          summary: 'Accept a Ministry Invitation as an existing Church Member',
          description:
            'Accept a Ministry Invitation as an already-authenticated existing Church Member, granting the stated Ministry Access Level and Roles.',
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
          summary: 'Decline a Ministry Invitation',
          description:
            'Decline a Ministry Invitation as its authenticated recipient, also declining a chained Church Invitation if one is paired with it.',
          params: redemptionParamsSchema,
          response: {
            200: declineOutcomeResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      this.handleDecline.bind(this),
    );

    // Volunteer Transfer (spec §8) — reachable only from a redemption that hit
    // the cross-Church split (§8.9). Authenticated, no Active Church required.
    app.get(
      '/transfer/:invitationId/preview',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'getVolunteerTransferPreview',
          summary: 'Preview a Volunteer Transfer',
          description:
            'Preview the effect of a Volunteer Transfer triggered by a cross-Church Ministry Invitation redemption: the Church Memberships that would end and the Assignments that would be withdrawn.',
          params: redemptionParamsSchema,
          response: {
            200: transferPreviewResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request, reply });
        if (!redeemer) return;
        const params = request.params as RedemptionParams;
        const preview = await this.volunteerTransferManager.getTransferPreview({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
          userId: redeemer.userId,
        });
        if (preview.kind === 'reviewable') {
          return reply.send({
            kind: preview.kind,
            sourceChurchName: preview.sourceChurchName,
            destinationChurchName: preview.destinationChurchName,
            endedMemberships: preview.endedMemberships,
            withdrawnAssignments: preview.withdrawnAssignments.map(
              (assignment) => ({
                eventName: assignment.eventName,
                timeSlotStart: fromDate({ date: assignment.timeSlotStart }),
                roleName: assignment.roleName,
              }),
            ),
          });
        }
        return reply.send(preview);
      },
    );

    app.post(
      '/transfer/:invitationId/confirm',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'confirmVolunteerTransfer',
          summary: 'Confirm a Volunteer Transfer',
          description:
            "Confirm the Volunteer Transfer, retiring the User's Volunteer profile in the source Church and creating a fresh one in the destination Church.",
          params: redemptionParamsSchema,
          body: confirmTransferBodySchema,
          response: {
            200: confirmTransferOutcomeResponseSchema,
            401: unauthorizedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request, reply });
        if (!redeemer) return;
        const params = request.params as RedemptionParams;
        const body = request.body as ConfirmTransferBody;
        const outcome = await this.volunteerTransferManager.confirmTransfer({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
          userId: redeemer.userId,
          destinationChurchName: body.destinationChurchName,
          password: body.password,
          idempotencyKey: body.idempotencyKey,
        });
        return reply.send(outcome);
      },
    );

    if (debugEndpointsEnabled()) {
      app.get(
        '/church/:invitationId/debug-code',
        {
          schema: {
            tags: ['redemption-debug'],
            operationId: 'debugGetChurchInvitationVerificationCode',
            summary: 'Get a Church Invitation verification code (debug)',
            description:
              'Non-production only: read back the verification code sent for a Church Invitation, bypassing email delivery.',
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
    expiresAt: fromDate({ date: preview.expiresAt }),
  };
}
