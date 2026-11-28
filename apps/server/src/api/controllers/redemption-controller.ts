import type { AppConfig } from '@church/app-config';
import {
  ChurchInvitationId,
  MinistryInvitationId,
} from '../../domain/branded-ids';
import type { IRedemptionManager } from '../../domain/contracts/application/redemption-manager';
import type { IVolunteerTransferManager } from '../../domain/contracts/application/volunteer-transfer-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import { VerificationCodeError } from '../../domain/errors/verification-code-error';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { requireSession } from '../auth/require-session';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  acceptExistingMemberBodySchema,
  authenticatedInvitationStatusResponseSchema,
  churchInvitationAcceptOutcomeResponseSchema,
  churchInvitationReviewStatusResponseSchema,
  confirmTransferBodySchema,
  confirmTransferOutcomeResponseSchema,
  debugInvitationLinkQuerystringSchema,
  debugInvitationLinkResponseSchema,
  debugVerificationCodeResponseSchema,
  declineOutcomeResponseSchema,
  existingMemberOutcomeResponseSchema,
  publicDeclineResponseSchema,
  rateLimitedResponseSchema,
  redeemNewUserBodySchema,
  redemptionMapper,
  redemptionOutcomeResponseSchema,
  redemptionParamsSchema,
  redemptionPreviewResponseSchema,
  transferPreviewResponseSchema,
  unauthorizedResponseSchema,
  unavailableRedemptionResponseSchema,
  verificationCodeRequestedResponseSchema,
} from '../dtos/redemption.dto';
import { serviceUnavailableResponseSchema } from '../dtos/service-unavailable.dto';
import { debugEndpointsEnabled } from '../utils/debug-endpoints';
import { isRateLimited } from '../utils/rate-limit';
import { RefusalError } from '../utils/refusal-error';
import type {
  AuthenticatedRedeemer,
  RedemptionControllerDependencies,
  RequireRedeemerInput,
} from './redemption-controller.types';

export class RedemptionController implements FastifyController {
  readonly prefix = '/redemption';

  private readonly redemptionManager: IRedemptionManager;
  private readonly volunteerTransferManager: IVolunteerTransferManager;
  private readonly rateLimit: AppConfig['redemptionRateLimit'];
  private readonly sessionGateway: SessionGateway;

  constructor({
    redemptionManager,
    volunteerTransferManager,
    sessionGateway,
    config,
  }: RedemptionControllerDependencies) {
    this.sessionGateway = sessionGateway;
    this.redemptionManager = redemptionManager;
    this.volunteerTransferManager = volunteerTransferManager;
    const { redemptionRateLimit } = config;
    this.rateLimit = redemptionRateLimit;
  }

  // named-parameters-ignore: Fastify plugin signature (instance, opts); registered through app.register
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
        if (
          isRateLimited({
            bucket: 'redemption',
            key: request.ip,
            limit: this.rateLimit,
          })
        )
          throw new RefusalError({ code: 'RATE_LIMITED' });
        const params = request.params;
        const preview = await this.redemptionManager.getPublicPreview({
          churchInvitationId: ChurchInvitationId.from(params.invitationId),
        });
        if (!preview)
          throw new RefusalError({ code: 'INVITATION_UNAVAILABLE' });
        return reply.send(redemptionMapper.publicPreviewToResponse(preview));
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
        if (
          isRateLimited({
            bucket: 'redemption',
            key: request.ip,
            limit: this.rateLimit,
          })
        )
          throw new RefusalError({ code: 'RATE_LIMITED' });
        const params = request.params;
        let sent: boolean;
        try {
          sent = await this.redemptionManager.requestVerificationCode({
            churchInvitationId: ChurchInvitationId.from(params.invitationId),
          });
        } catch (error) {
          if (error instanceof VerificationCodeError) {
            throw new RefusalError({ code: 'RATE_LIMITED' });
          }
          throw error;
        }
        if (!sent) throw new RefusalError({ code: 'INVITATION_UNAVAILABLE' });
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
            429: rateLimitedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (
          isRateLimited({
            bucket: 'redemption',
            key: request.ip,
            limit: this.rateLimit,
          })
        )
          throw new RefusalError({ code: 'RATE_LIMITED' });
        const params = request.params;
        const body = request.body;
        const outcome = await this.redemptionManager.redeemNewUser({
          churchInvitationId: ChurchInvitationId.from(params.invitationId),
          name: body.name,
          password: body.password,
          code: body.code,
          idempotencyKey: body.idempotencyKey,
        });
        // Only committed outcomes carry a session; failures never set a cookie.
        if ('sessionCookie' in outcome) {
          const { sessionCookie, ...committed } = outcome;
          reply.header('set-cookie', sessionCookie);
          return reply.send(committed);
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
            'Publicly decline a pending Church Invitation and any paired Ministry Invitation. Possession of the link authorizes it; no User or session is created.',
          params: redemptionParamsSchema,
          response: {
            200: publicDeclineResponseSchema,
            404: unavailableRedemptionResponseSchema,
            429: rateLimitedResponseSchema,
          },
        },
      },
      async (request, reply) => {
        if (
          isRateLimited({
            bucket: 'redemption',
            key: request.ip,
            limit: this.rateLimit,
          })
        )
          throw new RefusalError({ code: 'RATE_LIMITED' });
        const params = request.params;
        const outcome = await this.redemptionManager.declineChurchInvitation({
          churchInvitationId: ChurchInvitationId.from(params.invitationId),
        });
        if (outcome.kind === 'terminal-failure')
          throw new RefusalError({ code: 'INVITATION_UNAVAILABLE' });
        return reply.send(outcome);
      },
    );

    app.get(
      '/church/:invitationId/review',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'getChurchInvitationReviewStatus',
          summary: 'Get a Church Invitation signed-in review status',
          description:
            "Get an authenticated User's review of a plain Church Invitation addressed to their email, or the Ministry Invitation whose review covers a paired offer.",
          params: redemptionParamsSchema,
          response: {
            200: churchInvitationReviewStatusResponseSchema,
            401: unauthorizedResponseSchema,
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const params = request.params;
        const status =
          await this.redemptionManager.getChurchInvitationReviewStatus({
            churchInvitationId: ChurchInvitationId.from(params.invitationId),
            userId: redeemer.userId,
          });
        return reply.send(
          redemptionMapper.churchReviewStatusToResponse(status),
        );
      },
    );

    app.post(
      '/church/:invitationId/accept',
      {
        schema: {
          tags: ['redemption'],
          operationId: 'acceptChurchInvitation',
          summary: 'Accept a Church Invitation as a signed-in User',
          description:
            'Accept the reviewed plain Church Invitation as the signed-in User it is addressed to, granting the Church Access Level and making that Church active.',
          params: redemptionParamsSchema,
          body: acceptExistingMemberBodySchema,
          response: {
            200: churchInvitationAcceptOutcomeResponseSchema,
            401: unauthorizedResponseSchema,
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const params = request.params;
        const body = request.body;
        const outcome = await this.redemptionManager.acceptChurchInvitation({
          churchInvitationId: ChurchInvitationId.from(params.invitationId),
          userId: redeemer.userId,
          sessionCookie: redeemer.sessionCookie,
          idempotencyKey: body.idempotencyKey,
          reviewToken: body.reviewToken,
        });
        return reply.send(outcome);
      },
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
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const params = request.params;
        const status =
          await this.redemptionManager.getAuthenticatedInvitationStatus({
            ministryInvitationId: MinistryInvitationId.from(
              params.invitationId,
            ),
            userId: redeemer.userId,
          });
        return reply.send(
          redemptionMapper.ministryInvitationStatusToResponse(status),
        );
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
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const params = request.params;
        const body = request.body;
        const outcome = await this.redemptionManager.acceptExistingMember({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
          userId: redeemer.userId,
          sessionCookie: redeemer.sessionCookie,
          idempotencyKey: body.idempotencyKey,
          reviewToken: body.reviewToken,
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
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      // Authenticated Ministry decline: the invitation's own `kind` decides
      // whether the chained pair is rejected alongside it (spec §7.3).
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const outcome = await this.redemptionManager.declineInvitation({
          ministryInvitationId: MinistryInvitationId.from(
            request.params.invitationId,
          ),
          userId: redeemer.userId,
          sessionCookie: redeemer.sessionCookie,
        });
        reply.send(outcome);
      },
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
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const params = request.params;
        const preview = await this.volunteerTransferManager.getTransferPreview({
          ministryInvitationId: MinistryInvitationId.from(params.invitationId),
          userId: redeemer.userId,
        });
        return reply.send(redemptionMapper.transferPreviewToResponse(preview));
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
            503: serviceUnavailableResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const redeemer = await this.requireRedeemer({ request });
        const params = request.params;
        const body = request.body;
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
          const params = request.params;
          const code = await this.redemptionManager.getDebugVerificationCode({
            churchInvitationId: ChurchInvitationId.from(params.invitationId),
          });
          if (!code) throw new RefusalError({ code: 'INVITATION_UNAVAILABLE' });
          return reply.send({ code });
        },
      );
      app.get(
        '/debug-invitation-link',
        {
          schema: {
            tags: ['redemption-debug'],
            operationId: 'debugGetInvitationLink',
            summary: 'Get the joining link last emailed to an address (debug)',
            description:
              'Non-production only: read back the joining link of the latest invitation email captured for an address, bypassing email delivery.',
            querystring: debugInvitationLinkQuerystringSchema,
            response: {
              200: debugInvitationLinkResponseSchema,
              404: unavailableRedemptionResponseSchema,
            },
          },
        },
        async (request, reply) => {
          const { email } = request.query;
          const redemptionUrl =
            await this.redemptionManager.getDebugInvitationLink({ email });
          if (!redemptionUrl)
            throw new RefusalError({ code: 'INVITATION_UNAVAILABLE' });
          return reply.send({ redemptionUrl });
        },
      );
    }
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
  }: RequireRedeemerInput): Promise<AuthenticatedRedeemer> {
    const session = await requireSession({
      sessionGateway: this.sessionGateway,
      request,
    });
    const sessionCookie = request.headers.cookie;
    if (!sessionCookie) throw new RefusalError({ code: 'UNAUTHORIZED' });
    return { userId: session.userId, sessionCookie };
  }
}
