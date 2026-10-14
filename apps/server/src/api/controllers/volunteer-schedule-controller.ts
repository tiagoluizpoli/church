import { ChurchId, VolunteerId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IVolunteerManager } from '../../domain/contracts/application/volunteer-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentListResponseSchema,
  volunteerMapper,
} from '../dtos/volunteer.dto';

interface VolunteerScheduleControllerDependencies {
  volunteerManager: IVolunteerManager;
  activeChurchResolver: IActiveChurchResolver;
}

export class VolunteerScheduleController implements FastifyController {
  readonly prefix = '/volunteer';

  constructor({
    volunteerManager,
    activeChurchResolver,
  }: VolunteerScheduleControllerDependencies) {
    this.volunteerManager = volunteerManager;
    this.activeChurchResolver = activeChurchResolver;
  }

  private readonly volunteerManager: IVolunteerManager;
  private readonly activeChurchResolver: IActiveChurchResolver;

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
            "List the current Volunteer's Assignments from published MinistryParticipations.",
          response: { 200: assignmentListResponseSchema },
        },
      },
      async (request, reply) => {
        const assignments = await this.volunteerManager.getPublishedSchedule({
          // Non-null: this controller's preValidation requires a Volunteer profile.
          volunteerId: VolunteerId.from(request.volunteerId as string),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(volunteerMapper.assignmentsToResponse(assignments));
      },
    );
  }
}
