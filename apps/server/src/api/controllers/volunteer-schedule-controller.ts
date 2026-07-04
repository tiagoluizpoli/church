import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import { ChurchId, UserId, VolunteerId } from '../../domain/branded-ids';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentListResponseSchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';
import { headersFromRequest } from '../utils/headers';

@injectable()
export class VolunteerScheduleController implements FastifyController {
  readonly prefix = '/volunteer';

  constructor(
    @inject('IVolunteerManager')
    private readonly volunteerManager: IVolunteerManager,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook('preValidation', async (request, reply) => {
      const headers = headersFromRequest(request);
      const session = await auth.api.getSession({ headers }).catch(() => null);
      if (!session?.user) {
        return reply
          .status(401)
          .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const ctx = await this.volunteerManager.resolveVolunteerContext(
        UserId.from(session.user.id),
      );
      if (!ctx) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Volunteer profile not found',
        });
      }

      request.volunteerId = ctx.volunteerId;
      request.churchId = ctx.churchId;
    });

    app.get(
      '/schedule',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getPublishedVolunteerSchedule',
          response: { 200: assignmentListResponseSchema },
        },
      },
      async (request, reply) => {
        const assignments = await this.volunteerManager.getPublishedSchedule({
          volunteerId: VolunteerId.from(request.volunteerId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.assignmentsToResponse(assignments));
      },
    );
  }
}
