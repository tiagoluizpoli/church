import 'reflect-metadata';
import { auth } from '@church/auth';
import { inject, injectable } from 'tsyringe';
import type { VolunteerRepository } from '../../application/contracts/volunteer.repository';
import type { IMinistryManager } from '../../domain/contracts/ministry-manager';
import type { ChurchId } from '../../domain/entities/church';
import type { UserId, VolunteerId } from '../../domain/entities/volunteer';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  ministryListResponseSchema,
  ministryMapper,
} from '../dtos/ministry.dto';

@injectable()
export class AdminLeaderController implements FastifyController {
  readonly prefix = '/admin';

  constructor(
    @inject('IMinistryManager')
    private readonly ministryManager: IMinistryManager,
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook('preHandler', async (request, reply) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value)
          headers.set(key, Array.isArray(value) ? (value[0] ?? '') : value);
      }

      const session = await auth.api.getSession({ headers }).catch(() => null);
      if (!session?.user) {
        return reply
          .status(401)
          .send({ error: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      const volunteer = await this.volunteerRepo.findByUserIdGlobally(
        session.user.id as UserId,
      );
      if (!volunteer) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Volunteer profile not found',
        });
      }

      const ledMinistries = await this.volunteerRepo.listLedMinistries(
        volunteer.churchId,
        volunteer.id,
      );
      const isAdmin = ledMinistries.some(
        (lm) => lm.ministryName === 'Administration',
      );
      const isLeader = ledMinistries.length > 0;

      if (!isAdmin && !isLeader) {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Admin or leader role required',
        });
      }

      request.volunteerId = volunteer.id as string;
      request.churchId = volunteer.churchId as string;
    });

    app.get(
      '/ministries',
      {
        schema: {
          response: { 200: ministryListResponseSchema },
        },
      },
      async (request, reply) => {
        const ministries = await this.ministryManager.listByLeader({
          leaderId: request.volunteerId as VolunteerId,
          churchId: request.churchId as ChurchId,
        });
        return reply.send(ministryMapper.toResponseList(ministries));
      },
    );
  }
}
