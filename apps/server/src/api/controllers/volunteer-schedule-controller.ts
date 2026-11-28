import type { VolunteerId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import { authErrorResponses } from '../dtos/error-response.dto';
import {
  volunteerScheduleQuerystringSchema,
  volunteerScheduleResponseSchema,
} from '../dtos/volunteer.dto';
import type { VolunteerScheduleControllerDependencies } from './volunteer-schedule-controller.types';

export class VolunteerScheduleController implements FastifyController {
  readonly prefix = '/volunteer';

  private readonly volunteerManager: IVolunteerManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly sessionGateway: SessionGateway;

  constructor({
    volunteerManager,
    activeChurchResolver,
    sessionGateway,
  }: VolunteerScheduleControllerDependencies) {
    this.volunteerManager = volunteerManager;
    this.activeChurchResolver = activeChurchResolver;
    this.sessionGateway = sessionGateway;
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
        sessionGateway: this.sessionGateway,
        requireVolunteer: true,
      }),
    );

    app.get(
      '/schedule',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getPublishedVolunteerSchedule',
          summary: "Get the caller's published schedule",
          description:
            "List the current Volunteer's upcoming and in-progress Assignments from published MinistryParticipations, with the published Schedules of every Ministry they serve in. Search (trimmed, case-insensitive literal Event-title substring), `month` (`yyyy-MM` of the Shift start in the Church Timezone) and `ministryId` narrow `assignments` only: `counts`, `next` and `options` cover the whole list.",
          querystring: volunteerScheduleQuerystringSchema,
          response: {
            200: volunteerScheduleResponseSchema,
            ...authErrorResponses,
          },
        },
      },
      async (request, reply) => {
        const schedule = await this.volunteerManager.getPublishedSchedule({
          // Non-null: this controller's preValidation requires a Volunteer profile.
          volunteerId: request.volunteerId as VolunteerId,
          churchId: request.churchId,
          filters: request.query,
        });
        return reply.send(schedule);
      },
    );
  }
}
