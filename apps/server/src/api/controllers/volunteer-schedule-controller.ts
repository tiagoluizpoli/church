import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
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

@injectable()
export class VolunteerScheduleController implements FastifyController {
  readonly prefix = '/volunteer';

  constructor(
    @inject('IVolunteerManager')
    private readonly volunteerManager: IVolunteerManager,
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
  ) {}

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
