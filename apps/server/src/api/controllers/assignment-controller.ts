import 'reflect-metadata';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  AssignmentId,
  ChurchId,
  RoleId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAssignmentManager } from '../../domain/contracts/application/assignment-manager';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import type { AuthorityGuard } from '../auth/authority-guard';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  assignmentMapper,
  assignmentResponseSchema,
  auditListResponseSchema,
  createAssignmentBodySchema,
  overrideAssignmentBodySchema,
} from '../dtos/assignment.dto';

interface AssignmentRouteParams {
  assignmentId: string;
}

interface DenyEventSlotScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  slotId: string;
}

interface DenyAssignmentScopeInput {
  request: FastifyRequest;
  reply: FastifyReply;
  assignmentId: string;
}

@injectable()
export class AssignmentController implements FastifyController {
  readonly prefix = '/assignments';

  constructor(
    @inject('IAssignmentManager')
    private readonly assignmentManager: IAssignmentManager,
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('AuthorityGuard')
    private readonly authorityGuard: AuthorityGuard,
  ) {}

  registerRoutes(
    app: FastifyTypedInstance,
    _opts: Record<string, unknown>,
  ): void {
    app.addHook(
      'preValidation',
      createActiveChurchPreValidation({
        resolver: this.activeChurchResolver,
      }),
    );

    app.post(
      '/',
      {
        schema: {
          tags: ['assignments'],
          operationId: 'createAssignment',
          body: createAssignmentBodySchema,
          response: { 201: assignmentResponseSchema },
        },
      },
      async (request, reply) => {
        const body = request.body as z.infer<typeof createAssignmentBodySchema>;
        const denied = await this.denyEventSlotScope({
          request,
          reply,
          slotId: body.slotId,
        });
        if (denied) return;

        const result = await this.assignmentManager.createAssignment({
          churchId: ChurchId.from(request.churchId),
          slotId: TimeSlotId.from(body.slotId),
          volunteerId: VolunteerId.from(body.volunteerId),
          roleId: RoleId.from(body.roleId),
          actorId: UserId.from(request.userId),
          reason: body.reason,
        });
        return reply.status(201).send(assignmentMapper.toResponse(result));
      },
    );

    app.post(
      '/:assignmentId/override',
      {
        schema: {
          tags: ['assignments'],
          operationId: 'overrideAssignment',
          body: overrideAssignmentBodySchema,
          response: { 201: z.object({ overridden: z.literal(true) }) },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const denied = await this.denyAssignmentScope({
          request,
          reply,
          assignmentId,
        });
        if (denied) return;

        const body = request.body as z.infer<
          typeof overrideAssignmentBodySchema
        >;
        await this.assignmentManager.overrideAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
          actorId: UserId.from(request.userId),
          reason: body.reason,
        });
        return reply.status(201).send({ overridden: true });
      },
    );

    app.delete(
      '/:assignmentId',
      { schema: { tags: ['assignments'], operationId: 'deleteAssignment' } },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const denied = await this.denyAssignmentScope({
          request,
          reply,
          assignmentId,
        });
        if (denied) return;

        await this.assignmentManager.deleteAssignment({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
          actorId: UserId.from(request.userId),
        });
        return reply.status(204).send();
      },
    );

    app.get(
      '/:assignmentId/audit',
      {
        schema: {
          tags: ['assignments'],
          operationId: 'getAssignmentAudit',
          response: { 200: auditListResponseSchema },
        },
      },
      async (request, reply) => {
        const { assignmentId } = request.params as AssignmentRouteParams;
        const denied = await this.denyAssignmentScope({
          request,
          reply,
          assignmentId,
        });
        if (denied) return;

        const items = await this.assignmentManager.listAuditLog({
          assignmentId: AssignmentId.from(assignmentId),
          churchId: ChurchId.from(request.churchId),
        });
        return reply.send(assignmentMapper.auditListToResponse(items));
      },
    );
  }

  /**
   * Returns whether access was denied. `FastifyReply` is a thenable (it
   * resolves once the response is flushed) — `return reply.send(...)` from
   * an `async` method would have its own returned promise silently adopt
   * that reply's resolution instead of the reply object itself, so callers
   * must never `await` a reply and branch on the awaited value. Each guard
   * here sends the 403 as a side effect and returns a plain boolean.
   */
  private async denyEventSlotScope({
    request,
    reply,
    slotId,
  }: DenyEventSlotScopeInput): Promise<boolean> {
    const allowed = await this.authorityGuard.canManageEventSlot({
      churchId: ChurchId.from(request.churchId),
      slotId: TimeSlotId.from(slotId),
      userId: UserId.from(request.userId),
    });
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Slot belongs to another ministry',
    });
    return true;
  }

  private async denyAssignmentScope({
    request,
    reply,
    assignmentId,
  }: DenyAssignmentScopeInput): Promise<boolean> {
    const assignment = await this.assignmentManager.getAssignment({
      churchId: ChurchId.from(request.churchId),
      assignmentId: AssignmentId.from(assignmentId),
    });
    const { shiftId } = assignment;
    const allowed =
      shiftId != null &&
      (await this.authorityGuard.canManageShift({
        churchId: ChurchId.from(request.churchId),
        shiftId,
        userId: UserId.from(request.userId),
      }));
    if (allowed) return false;

    reply.status(403).send({
      error: 'FORBIDDEN',
      message: 'Assignment belongs to another ministry',
    });
    return true;
  }
}
