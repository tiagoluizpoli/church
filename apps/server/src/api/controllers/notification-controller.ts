import { NotFoundError } from '@church/core';
import { NotificationId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { INotificationManager } from '../../domain/contracts/application/notification-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import {
  markedResponseSchema,
  memberNotificationListResponseSchema,
  memberNotificationMapper,
  memberNotificationParamsSchema,
  memberNotificationsQuerystringSchema,
} from '../dtos/member-notification.dto';
import { pageLimitSchema } from '../dtos/page-limit.dto';
import { refuse } from '../utils/refuse';
import { requestCaller } from '../utils/request-caller';
import type { NotificationControllerDependencies } from './notification-controller.types';

/**
 * A Church Member's own inbox. The session supplies User and Active Church —
 * no Volunteer profile is required and callers cannot choose an owner.
 */
export class NotificationController implements FastifyController {
  readonly prefix = '';

  private readonly notificationManager: INotificationManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: IAuthorityGuard;
  private readonly maxPageSize: number;

  constructor({
    notificationManager,
    activeChurchResolver,
    authorityGuard,
    maxPageSize,
  }: NotificationControllerDependencies) {
    this.notificationManager = notificationManager;
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

    // Every route is the caller's own inbox: the owner is the session User,
    // never a parameter, so member-level access is the only rule to ask.
    app.addHook('preHandler', async (request, reply) => {
      const caller = requestCaller({ request });
      const { churchId } = caller;
      const decision = await this.authorityGuard.decideAuthority({
        ...caller,
        action: 'access',
        resource: { type: 'church', churchId },
        scope: 'function',
      });
      if (!decision.allowed)
        return refuse({ reply, request, code: 'FORBIDDEN' });
    });

    const refusals = {
      ...authErrorResponses,
      409: errorResponseSchema,
      422: errorResponseSchema,
    };

    app.get(
      '/notifications',
      {
        schema: {
          tags: ['notifications'],
          operationId: 'getNotifications',
          summary: "List the caller's Notifications",
          description:
            "List the caller's own Notifications in the Active Church, newest first, with the unread count of the whole inbox.",
          querystring: memberNotificationsQuerystringSchema.extend({
            limit: pageLimitSchema({
              maxPageSize: this.maxPageSize,
            }).optional(),
          }),
          response: { 200: memberNotificationListResponseSchema, ...refusals },
        },
      },
      async (request, reply) => {
        const { cursor, limit } = request.query;
        const page = await this.notificationManager.list({
          userId: request.userId,
          churchId: request.churchId,
          cursor,
          limit,
        });
        return reply.send(memberNotificationMapper.listToResponse(page));
      },
    );

    app.patch(
      '/notifications/:notificationId',
      {
        schema: {
          tags: ['notifications'],
          operationId: 'markNotificationRead',
          summary: 'Mark a Notification read',
          description:
            "Mark one of the caller's own Notifications as read. Repeating it keeps the first read Instant.",
          params: memberNotificationParamsSchema,
          response: {
            200: markedResponseSchema,
            404: errorResponseSchema,
            ...refusals,
          },
        },
      },
      async (request, reply) => {
        try {
          await this.notificationManager.markRead({
            userId: request.userId,
            churchId: request.churchId,
            notificationId: NotificationId.from(request.params.notificationId),
          });
        } catch (error) {
          if (error instanceof NotFoundError) {
            return refuse({ reply, request, code: 'NOT_FOUND' });
          }
          throw error;
        }
        return reply.status(200).send({ marked: true });
      },
    );

    app.post(
      '/notifications/read-all',
      {
        schema: {
          tags: ['notifications'],
          operationId: 'markAllNotificationsRead',
          summary: 'Mark all Notifications read',
          description:
            'Mark every unread Notification of the caller in the Active Church as read, including those not yet loaded.',
          response: { 201: markedResponseSchema, ...refusals },
        },
      },
      async (request, reply) => {
        await this.notificationManager.markAllRead({
          userId: request.userId,
          churchId: request.churchId,
        });
        return reply.status(201).send({ marked: true });
      },
    );
  }
}
