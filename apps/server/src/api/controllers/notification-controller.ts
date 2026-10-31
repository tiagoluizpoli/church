import { NotFoundError } from '@church/core';
import { z } from 'zod';
import { ChurchId, NotificationId, UserId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { INotificationManager } from '../../domain/contracts/application/notification-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  markedResponseSchema,
  memberNotificationListResponseSchema,
  memberNotificationMapper,
  memberNotificationParamsSchema,
  memberNotificationsQuerystringSchema,
} from '../dtos/member-notification.dto';
import { refuse } from '../utils/refuse';

const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

interface NotificationControllerDependencies {
  notificationManager: INotificationManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: AuthorityGuard;
  /** Most notifications one page may ask for (validated central config). */
  maxPageSize: number;
}

/**
 * A Church Member's own inbox. The session supplies User and Active Church —
 * no Volunteer profile is required and callers cannot choose an owner.
 */
export class NotificationController implements FastifyController {
  readonly prefix = '';

  private readonly notificationManager: INotificationManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly authorityGuard: AuthorityGuard;
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
      const decision = await this.authorityGuard.decideAuthority({
        churchId: ChurchId.from(request.churchId),
        userId: UserId.from(request.userId),
        action: 'access',
        resource: { type: 'church', churchId: ChurchId.from(request.churchId) },
        scope: 'function',
      });
      if (!decision.allowed)
        return refuse({ reply, request, code: 'FORBIDDEN' });
    });

    const refusals = {
      401: errorResponseSchema,
      403: errorResponseSchema,
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
            limit: z.coerce
              .number()
              .int()
              .min(1)
              .max(this.maxPageSize)
              .optional(),
          }),
          response: { 200: memberNotificationListResponseSchema, ...refusals },
        },
      },
      async (request, reply) => {
        const { cursor, limit } = request.query as z.infer<
          typeof memberNotificationsQuerystringSchema
        >;
        const page = await this.notificationManager.list({
          userId: UserId.from(request.userId),
          churchId: ChurchId.from(request.churchId),
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
            userId: UserId.from(request.userId),
            churchId: ChurchId.from(request.churchId),
            notificationId: NotificationId.from(
              (request.params as z.infer<typeof memberNotificationParamsSchema>)
                .notificationId,
            ),
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
          userId: UserId.from(request.userId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.status(201).send({ marked: true });
      },
    );
  }
}
