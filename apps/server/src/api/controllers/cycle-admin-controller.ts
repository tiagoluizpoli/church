import { z } from 'zod';
import { CycleId } from '../../domain/branded-ids';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { ICycleManager } from '../../domain/contracts/application/cycle-manager';
import type { ISetupProgressManager } from '../../domain/contracts/application/setup-progress-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';
import type { FastifyTypedInstance } from '../../main/fastify/types';
import { createActiveChurchPreValidation } from '../auth/active-church-pre-validation';
import { createChurchAdminHook } from '../auth/authority-access';
import type { FastifyController } from '../contracts/fastify-controller';
import {
  createCycleBodySchema,
  cycleAnchorsResponseSchema,
  cycleDetailsResponseSchema,
  cycleListResponseSchema,
  cycleMapper,
  cycleParamsSchema,
  cycleResponseSchema,
  cycleSendSummaryResponseSchema,
  listCyclesQuerySchema,
  overlappingCycleResponseSchema,
  sendCycleConflictResponseSchema,
  updateCycleBodySchema,
  updateCycleConflictResponseSchema,
} from '../dtos/cycle.dto';
import {
  authErrorResponses,
  errorResponseSchema,
} from '../dtos/error-response.dto';
import {
  setupProgressMapper,
  setupProgressResponseSchema,
} from '../dtos/setup-progress.dto';
import { dateFromCalendarDayString } from '../utils/request-time';
import type { CycleAdminControllerDependencies } from './cycle-admin-controller.types';

/** Church-admin routes for Cycles and the Active Church setup progress. */
export class CycleAdminController implements FastifyController {
  readonly prefix = '/admin';

  private readonly cycleManager: ICycleManager;
  private readonly setupProgressManager: ISetupProgressManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly sessionGateway: SessionGateway;
  private readonly authorityGuard: IAuthorityGuard;

  constructor({
    cycleManager,
    setupProgressManager,
    activeChurchResolver,
    sessionGateway,
    authorityGuard,
  }: CycleAdminControllerDependencies) {
    this.cycleManager = cycleManager;
    this.setupProgressManager = setupProgressManager;
    this.activeChurchResolver = activeChurchResolver;
    this.sessionGateway = sessionGateway;
    this.authorityGuard = authorityGuard;
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
      }),
    );

    app.addHook(
      'preValidation',
      createChurchAdminHook({ authorityGuard: this.authorityGuard }),
    );

    app.get(
      '/setup-progress',
      {
        schema: {
          tags: ['setup'],
          operationId: 'getSetupProgress',
          summary: 'Get the Active Church setup progress',
          description:
            'Five independently derived setup facts of the Active Church: an active Ministry; one active Ministry holding both an active Sector and an active Role; an issued leader-level Ministry Invitation (pending or accepted); an event template; and a Cycle ever sent, which an expired unsent draft never is. Nothing is persisted.',
          response: {
            200: setupProgressResponseSchema,
            ...authErrorResponses,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const churchId = request.churchId;
        const progress = await this.setupProgressManager.getSetupProgress({
          churchId,
        });
        return reply.send(
          setupProgressMapper.toResponse({ churchId, progress }),
        );
      },
    );

    app.post(
      '/cycles',
      {
        schema: {
          tags: ['planning'],
          operationId: 'createCycle',
          summary: 'Create a Cycle',
          description:
            'Create a new Cycle over an inclusive CalendarDay range for the Church. A one-day Cycle starts and ends on the same day; a range sharing any day with another Cycle of the Church is refused.',
          body: createCycleBodySchema,
          response: {
            201: cycleResponseSchema,
            ...authErrorResponses,
            409: overlappingCycleResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const body = request.body;
        const cycle = await this.cycleManager.createCycle({
          churchId: request.churchId,
          name: body.name,
          startDate: dateFromCalendarDayString({ value: body.startDate }),
          endDate: dateFromCalendarDayString({ value: body.endDate }),
        });
        return reply.status(201).send(cycleMapper.toResponse(cycle));
      },
    );

    app.get(
      '/cycles',
      {
        schema: {
          tags: ['planning'],
          operationId: 'listCycles',
          summary: 'List Cycles',
          description:
            'List the Church Cycles newest start first, filtered by state or period, name and an overlapping day range, with the per-state counts of all of them.',
          querystring: listCyclesQuerySchema,
          response: { 200: cycleListResponseSchema, ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const query = request.query;
        const list = await this.cycleManager.listCycles({
          churchId: request.churchId,
          state: query.state,
          period: query.period,
          search: query.search,
          from: query.from
            ? dateFromCalendarDayString({ value: query.from })
            : undefined,
          to: query.to
            ? dateFromCalendarDayString({ value: query.to })
            : undefined,
        });
        return reply.send(cycleMapper.listToResponse(list));
      },
    );

    app.get(
      '/cycles/anchors',
      {
        schema: {
          tags: ['planning'],
          operationId: 'getCycleAnchors',
          summary: 'Get the current and next Cycle',
          description:
            "The Cycle running on the Church's today (neither Draft nor Past) and the earliest Cycle starting after today that is not Past (Drafts included); either is null. Ties break on start date, then id.",
          response: { 200: cycleAnchorsResponseSchema, ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const anchors = await this.cycleManager.getCycleAnchors({
          churchId: request.churchId,
        });
        return reply.send(cycleMapper.anchorsToResponse(anchors));
      },
    );

    app.get(
      '/cycles/:cycleId',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'getCycle',
          summary: 'Get a Cycle',
          description: 'Get the details of a single Cycle.',
          response: { 200: cycleDetailsResponseSchema, ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const details = await this.cycleManager.getCycle({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
        });
        return reply.send(cycleMapper.detailsToResponse(details));
      },
    );

    app.get(
      '/cycles/:cycleId/send-summary',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'getCycleSendSummary',
          summary: 'Summarize a Draft Cycle before Send',
          description:
            'Advisory confirmation facts for a Draft Cycle: its Event count and the distinct active Ministries the Usual setup would pre-fill. Send rechecks everything itself. Refuses an empty Draft (EMPTY_CYCLE), legacy Events breaking the final-graph rules (INVALID_CYCLE_EVENTS) and Sent/Past Cycles.',
          response: {
            200: cycleSendSummaryResponseSchema,
            ...authErrorResponses,
            409: sendCycleConflictResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const summary = await this.cycleManager.getSendSummary({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
        });
        return reply.send(summary);
      },
    );

    app.post(
      '/cycles/:cycleId/send',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'sendCycle',
          summary: 'Send a Cycle',
          description:
            'Send a Draft Cycle to its Ministries in one transaction: schedule its Events, pre-fill staffing from the Usual setup and enqueue one Cycle-ready Notification per User leading an active Ministry. Refuses an empty Draft (EMPTY_CYCLE), legacy Events breaking the final-graph rules (INVALID_CYCLE_EVENTS), a Draft already holding staffing (DRAFT_STAFFING_RECONCILIATION_REQUIRED) and Sent/Past Cycles (ILLEGAL_STATE_TRANSITION).',
          response: {
            204: z.null(),
            ...authErrorResponses,
            409: sendCycleConflictResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        await this.cycleManager.sendCycle({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
        });
        return reply.status(204).send(null);
      },
    );

    app.patch(
      '/cycles/:cycleId',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'updateCycle',
          summary: 'Edit a Draft Cycle',
          description:
            'Rename or re-date a Draft Cycle; name, startDate and endDate are submitted together as an inclusive CalendarDay range. The Cycle never conflicts with itself. A range sharing a day with another Cycle, or excluding the Church-local start day of any owned Event, is refused; Events are never moved. Sent and Past Cycles are refused.',
          body: updateCycleBodySchema,
          response: {
            200: cycleResponseSchema,
            ...authErrorResponses,
            409: updateCycleConflictResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        const body = request.body;
        const cycle = await this.cycleManager.updateCycle({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
          name: body.name,
          startDate: dateFromCalendarDayString({ value: body.startDate }),
          endDate: dateFromCalendarDayString({ value: body.endDate }),
        });
        return reply.send(cycleMapper.toResponse(cycle));
      },
    );

    app.delete(
      '/cycles/:cycleId',
      {
        schema: {
          params: cycleParamsSchema,
          tags: ['planning'],
          operationId: 'deleteCycle',
          summary: 'Delete a Draft Cycle',
          description:
            'Hard-delete a Draft Cycle with every Event, Time Block and participation it owns. Sent and Past Cycles are refused.',
          response: { 204: z.null(), ...authErrorResponses },
        },
      },
      async (request, reply) => {
        const { cycleId } = request.params;
        await this.cycleManager.deleteCycle({
          churchId: request.churchId,
          cycleId: CycleId.from(cycleId),
        });
        return reply.status(204).send(null);
      },
    );
  }
}
