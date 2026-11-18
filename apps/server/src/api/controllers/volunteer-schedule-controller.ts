import { ChurchId, VolunteerId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import { volunteerScheduleResponseSchema } from '../dtos/volunteer.dto';

interface VolunteerScheduleControllerDependencies {
  volunteerManager: IVolunteerManager;
  activeChurchResolver: IActiveChurchResolver;
}

export class VolunteerScheduleController implements FastifyController {
  readonly prefix = '/volunteer';

  private readonly volunteerManager: IVolunteerManager;
  private readonly activeChurchResolver: IActiveChurchResolver;

  constructor({
    volunteerManager,
    activeChurchResolver,
  }: VolunteerScheduleControllerDependencies) {
    this.volunteerManager = volunteerManager;
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

    app.get(
      '/schedule',
      {
        schema: {
          tags: ['volunteer'],
          operationId: 'getPublishedVolunteerSchedule',
          summary: "Get the caller's published schedule",
          description:
            "List the current Volunteer's upcoming and in-progress Assignments from published MinistryParticipations, with the published Schedules of every Ministry they serve in.",
          response: { 200: volunteerScheduleResponseSchema },
        },
      },
      async (request, reply) => {
        const schedule = await this.volunteerManager.getPublishedSchedule({
          // Non-null: this controller's preValidation requires a Volunteer profile.
          volunteerId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(schedule);
      },
    );
  }
}
