import { NotFoundError } from '@church/core';
import {
  compareCalendarDays,
  compareInstants,
  fromDate,
  now,
  toDate,
  today,
} from '@church/time';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  UserId,
} from '../domain/branded-ids';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type { IChurchRecipients } from '../domain/contracts/application/church-recipients';
import type {
  CancelPlanningEventManagerInput,
  ConfirmPlanningMoveManagerInput,
  CreatePlanningEventManagerInput,
  CreatePlanningEventTimeBlockManagerInput,
  DeletePlanningEventManagerInput,
  DeletePlanningEventTimeBlockManagerInput,
  GeneratedPlanningCounts,
  GeneratePlanningTemplatesInput,
  IPlanningEventManager,
  PlanningEventGraph,
  PlanningMoveManagerInput,
  PlanningMovePreview,
  PlanningMoveResult,
  PreviewPlanningMoveManagerInput,
  UpdatePlanningEventDetailsManagerInput,
  UpdatePlanningEventManagerInput,
  UpdatePlanningEventTimeBlockManagerInput,
} from '../domain/contracts/application/planning-event-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../domain/contracts/infrastructure/assignment-audit.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '../domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type {
  PlanningEventRepository,
  SeededMinistry,
} from '../domain/contracts/infrastructure/planning-event.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { Church } from '../domain/entities/church';
import type { Cycle } from '../domain/entities/cycle';
import type { Event } from '../domain/entities/event';
import type { EventTimeBlock } from '../domain/entities/event-time-block';
import {
  IllegalStateTransitionError,
  LastRemainingEventTimeBlockError,
} from '../domain/errors';
import {
  CycleEventGenerator,
  type ExistingGeneratedEventTimeBlockFingerprint,
  eventTimeBlockEnvelope,
} from '../domain/services/cycle-event-generator';
import {
  assertEventGraph,
  type EventGraph,
} from '../domain/services/event-graph';
import { findMoveClashes, proposeMove } from '../domain/services/event-move';
import { removeAssignment } from './remove-assignment';

interface ComputeMoveInput {
  input: PlanningMoveManagerInput;
  church: Church;
  tx: TransactionContext;
}

interface EnsureCycleWritableInput {
  cycle: Cycle;
  churchTimeZone: string;
}

/**
 * Actions that can be attempted against an event/event time block while checking
 * whether the owning cycle still allows writes. Local to
 * `DbPlanningEventManager` — the shared `IPlanningEventManager` contract has
 * no concept of this distinction.
 */
type WritableEntityAction = 'update' | 'delete';

interface EnsureWritableEventInput {
  input:
    | CreatePlanningEventTimeBlockManagerInput
    | UpdatePlanningEventTimeBlockManagerInput
    | DeletePlanningEventTimeBlockManagerInput;
  church: Church;
  action: WritableEntityAction;
  tx: TransactionContext;
}

interface GetCycleEventInput {
  input:
    | EnsureWritableEventInput['input']
    | UpdatePlanningEventManagerInput
    | UpdatePlanningEventDetailsManagerInput
    | CancelPlanningEventManagerInput
    | DeletePlanningEventManagerInput;
  tx: TransactionContext;
}

interface LoadWritableEventTimeBlockInput {
  input:
    | UpdatePlanningEventTimeBlockManagerInput
    | DeletePlanningEventTimeBlockManagerInput;
  church: Church;
  action: WritableEntityAction;
  tx: TransactionContext;
}

interface EnqueueEventAddedInput {
  churchId: ChurchId;
  actingUserId: UserId;
  church: Church;
  cycle: Cycle;
  event: Event;
  ministries: SeededMinistry[];
  tx: TransactionContext;
}

interface DbPlanningEventManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  templateRepository: EventTemplateRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  eventTimeBlockRepository: EventTimeBlockRepository;
  assignmentRepository: AssignmentRepository;
  auditRepository: AssignmentAuditRepository;
  swapRequestRepository: SwapRequestRepository;
  recipients: IChurchRecipients;
  notifications: IChurchNotifications;
}

/**
 * Every write takes the Church's Cycle lock (shared with Cycle create and
 * Send) before reading mutable Cycle or child state, so conflicting Cycle and
 * Event writes serialize.
 */
export class DbPlanningEventManager implements IPlanningEventManager {
  private readonly generator = new CycleEventGenerator();

  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly templateRepository: EventTemplateRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;
  private readonly assignmentRepository: AssignmentRepository;
  private readonly auditRepository: AssignmentAuditRepository;
  private readonly swapRequestRepository: SwapRequestRepository;
  private readonly recipients: IChurchRecipients;
  private readonly notifications: IChurchNotifications;

  constructor({
    cycleRepository,
    eventRepository,
    templateRepository,
    churchRepository,
    unitOfWork,
    eventTimeBlockRepository,
    assignmentRepository,
    auditRepository,
    swapRequestRepository,
    recipients,
    notifications,
  }: DbPlanningEventManagerDependencies) {
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.templateRepository = templateRepository;
    this.churchRepository = churchRepository;
    this.unitOfWork = unitOfWork;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.assignmentRepository = assignmentRepository;
    this.auditRepository = auditRepository;
    this.swapRequestRepository = swapRequestRepository;
    this.recipients = recipients;
    this.notifications = notifications;
  }

  async generateFromTemplates(
    input: GeneratePlanningTemplatesInput,
  ): Promise<GeneratedPlanningCounts> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const templateIds = [...new Set(input.templateIds)];

    return this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      // Apply is Draft-only: a Sent Cycle's staffing is decided at Send.
      if (cycle.state !== 'draft') {
        throw new IllegalStateTransitionError({
          from: cycle.state,
          to: 'apply-templates',
        });
      }

      const templates = await this.templateRepository.getByIds({
        churchId: input.churchId,
        templateIds,
        tx,
      });
      if (templates.length !== templateIds.length) {
        throw new NotFoundError('Event template not found');
      }
      const existingEvents = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const plans = this.generator.generate({
        cycle,
        templates,
        existingEvents: existingEvents.map((eventGroup) => ({
          eventId: eventGroup.event.id,
          eventDate: today({
            instant: eventGroup.event.start,
            timeZone: church.timezone,
          }),
          sourceTemplateId: eventGroup.event.sourceTemplateId,
          cancelled: eventGroup.event.status === 'cancelled',
        })),
        existingFingerprints: existingEvents.flatMap((eventGroup) => {
          const fingerprints: ExistingGeneratedEventTimeBlockFingerprint[] = [];

          for (const eventTimeBlock of eventGroup.eventTimeBlocks) {
            if (!eventTimeBlock.sourceTemplateTimeBlockId) {
              continue;
            }

            fingerprints.push({
              eventDate: today({
                instant: eventGroup.event.start,
                timeZone: church.timezone,
              }),
              sourceTemplateTimeBlockId:
                eventTimeBlock.sourceTemplateTimeBlockId,
            });
          }

          return fingerprints;
        }),
        timeZone: church.timezone,
      });
      const existingById = new Map(
        existingEvents.map((eventGroup) => [eventGroup.event.id, eventGroup]),
      );

      let generatedEventCount = 0;
      let generatedEventTimeBlockCount = 0;

      for (const plan of plans) {
        let targetEventId: EventId;

        if (plan.kind === 'create_event') {
          const created = await this.eventRepository.createEvent({
            churchId: input.churchId,
            cycleId: input.cycleId,
            sourceTemplateId: plan.sourceTemplateId,
            title: plan.title,
            start: toDate({ instant: plan.start }),
            end: toDate({ instant: plan.end }),
            status: 'draft',
            tx,
          });
          targetEventId = created.id;
          await this.eventRepository.seedParticipations({
            churchId: input.churchId,
            cycleId: input.cycleId,
            eventId: targetEventId,
            tx,
          });
          generatedEventCount += 1;
        } else {
          targetEventId = plan.eventId;
          const existing = existingById.get(targetEventId);
          if (existing) {
            const { start, end } = eventTimeBlockEnvelope({
              eventTimeBlocks: [
                {
                  startTime: existing.event.start,
                  endTime: existing.event.end,
                },
                ...existing.eventTimeBlocks.map(({ startTime, endTime }) => ({
                  startTime,
                  endTime,
                })),
                ...plan.eventTimeBlocks,
              ],
            });
            const grows =
              compareInstants({ left: start, right: existing.event.start }) <
                0 ||
              compareInstants({ left: end, right: existing.event.end }) > 0;
            if (grows) {
              await this.eventRepository.updateEvent({
                churchId: input.churchId,
                eventId: targetEventId,
                start: toDate({ instant: start }),
                end: toDate({ instant: end }),
                tx,
              });
            }
          }
        }

        for (const eventTimeBlock of plan.eventTimeBlocks) {
          await this.eventRepository.createEventTimeBlock({
            churchId: input.churchId,
            eventId: targetEventId,
            sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
            startTime: toDate({ instant: eventTimeBlock.startTime }),
            endTime: toDate({ instant: eventTimeBlock.endTime }),
            label: eventTimeBlock.label,
            tx,
          });
          generatedEventTimeBlockCount += 1;
        }
      }

      return {
        generatedEventCount,
        generatedEventTimeBlockCount,
      };
    });
  }

  async createEvent(
    input: CreatePlanningEventManagerInput,
  ): Promise<PlanningEventGraph> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const isDraft = cycle.state === 'draft';
      if (!isDraft && cycle.state !== 'sent') {
        throw new IllegalStateTransitionError({
          from: cycle.state,
          to: 'create-event',
        });
      }

      assertEventGraph({
        graph: toProposedGraph(input),
        cycle,
        timeZone: church.timezone,
      });

      const event = await this.eventRepository.createEvent({
        churchId: input.churchId,
        cycleId: input.cycleId,
        title: input.title,
        location: input.location,
        start: input.start,
        end: input.end,
        status: isDraft ? 'draft' : 'scheduled',
        tx,
      });

      // A plain insert: no Shift is seeded for a Draft block.
      const blockIds: EventTimeBlockId[] = [];
      // Sequential: concurrent queries on one transaction connection warn in pg.
      for (const block of input.eventTimeBlocks) {
        blockIds.push(
          await this.eventRepository.createEventTimeBlock({
            churchId: input.churchId,
            eventId: event.id,
            label: block.label,
            startTime: block.startTime,
            endTime: block.endTime,
            tx,
          }),
        );
      }

      const ministries = await this.eventRepository.seedParticipations({
        churchId: input.churchId,
        cycleId: input.cycleId,
        eventId: event.id,
        tx,
      });

      const eventTimeBlocks = await this.listInOrder({
        churchId: input.churchId,
        eventId: event.id,
        blockIds,
        tx,
      });
      if (!isDraft) {
        await this.enqueueEventAdded({
          churchId: input.churchId,
          actingUserId: input.actingUserId,
          church,
          cycle,
          event,
          ministries,
          tx,
        });
      }
      return { event, eventTimeBlocks };
    });
  }

  async updateEvent(
    input: UpdatePlanningEventManagerInput,
  ): Promise<PlanningEventGraph> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const { churchId, eventId } = input;

    return this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({ churchId, tx });

      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.getCycleEvent({ input, tx });
      // Draft-only: a reopened Event of a Sent Cycle is no back door.
      if (cycle.state !== 'draft' || currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError({
          from: cycle.state === 'draft' ? currentEvent.status : cycle.state,
          to: 'update',
        });
      }

      const persisted = await this.eventTimeBlockRepository.listByEvent({
        churchId,
        eventId,
        tx,
      });
      const persistedIds = new Set<string>(persisted.map(({ id }) => id));
      const alien = input.eventTimeBlocks.find(
        ({ id }) => id !== undefined && !persistedIds.has(id),
      );
      if (alien?.id) {
        throw new NotFoundError(`EventTimeBlock not found: ${alien.id}`);
      }

      assertEventGraph({
        graph: toProposedGraph(input),
        cycle,
        timeZone: church.timezone,
      });

      // The stored description and source-template ids are left as they are.
      const event = await this.eventRepository.updateEvent({
        churchId,
        eventId,
        title: input.title,
        location: input.location ?? null,
        start: input.start,
        end: input.end,
        tx,
      });

      const retainedIds = new Set<string>(
        input.eventTimeBlocks.flatMap(({ id }) => id ?? []),
      );
      // Sequential: concurrent queries on one transaction connection warn in pg.
      for (const { id } of persisted) {
        if (!retainedIds.has(id)) {
          await this.eventTimeBlockRepository.deleteById({
            churchId,
            eventTimeBlockId: id,
            tx,
          });
        }
      }

      const blockIds: EventTimeBlockId[] = [];
      for (const block of input.eventTimeBlocks) {
        const { id, label, startTime, endTime } = block;
        if (id) {
          await this.eventTimeBlockRepository.update({
            churchId,
            eventTimeBlockId: id,
            input: { label, startTime, endTime },
            tx,
          });
          blockIds.push(id);
        } else {
          blockIds.push(
            await this.eventRepository.createEventTimeBlock({
              churchId,
              eventId,
              label,
              startTime,
              endTime,
              tx,
            }),
          );
        }
      }

      const eventTimeBlocks = await this.listInOrder({
        churchId,
        eventId,
        blockIds,
        tx,
      });
      return { event, eventTimeBlocks };
    });
  }

  async updateEventDetails(
    input: UpdatePlanningEventDetailsManagerInput,
  ): Promise<PlanningEventGraph> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const { churchId, eventId } = input;

    return this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({ churchId, tx });

      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      await this.getCycleEvent({ input, tx });
      // Draft Cycles keep the complete-graph edit; this is the Sent alternative.
      if (cycle.state !== 'sent') {
        throw new IllegalStateTransitionError({
          from: cycle.state,
          to: 'update-details',
        });
      }

      const event = await this.eventRepository.updateEvent({
        churchId,
        eventId,
        title: input.title,
        location: input.location ?? null,
        tx,
      });
      const eventTimeBlocks = await this.eventTimeBlockRepository.listByEvent({
        churchId,
        eventId,
        tx,
      });
      return { event, eventTimeBlocks };
    });
  }

  /** The Event's blocks in submitted order; every id was written in `tx`. */
  private async listInOrder({
    churchId,
    eventId,
    blockIds,
    tx,
  }: ListInOrderInput): Promise<EventTimeBlock[]> {
    const listed = await this.eventTimeBlockRepository.listByEvent({
      churchId,
      eventId,
      tx,
    });
    const listedById = new Map(listed.map((block) => [block.id, block]));
    return blockIds.flatMap((id) => listedById.get(id) ?? []);
  }

  async createEventTimeBlock(
    input: CreatePlanningEventTimeBlockManagerInput,
  ): Promise<EventTimeBlock> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      await this.ensureWritableEvent({ input, church, action: 'update', tx });

      return this.eventTimeBlockRepository.create({
        churchId: input.churchId,
        input: {
          eventId: input.eventId,
          startTime: input.startTime,
          endTime: input.endTime,
          label: input.label,
        },
        tx,
      });
    });
  }

  async updateEventTimeBlock(
    input: UpdatePlanningEventTimeBlockManagerInput,
  ): Promise<EventTimeBlock> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    return this.unitOfWork.run(async (tx) => {
      await this.loadWritableEventTimeBlock({
        input,
        church,
        action: 'update',
        tx,
      });

      return this.eventTimeBlockRepository.update({
        churchId: input.churchId,
        eventTimeBlockId: input.eventTimeBlockId,
        input: {
          startTime: input.startTime,
          endTime: input.endTime,
          label: input.label,
        },
        tx,
      });
    });
  }

  async deleteEventTimeBlock(
    input: DeletePlanningEventTimeBlockManagerInput,
  ): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      await this.loadWritableEventTimeBlock({
        input,
        church,
        action: 'delete',
        tx,
      });

      const eventTimeBlocks = await this.eventTimeBlockRepository.listByEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        tx,
      });

      if (eventTimeBlocks.length <= 1) {
        throw new LastRemainingEventTimeBlockError();
      }

      await this.eventTimeBlockRepository.deleteById({
        churchId: input.churchId,
        eventTimeBlockId: input.eventTimeBlockId,
        tx,
      });
    });
  }

  private async ensureWritableEvent({
    input,
    church,
    action,
    tx,
  }: EnsureWritableEventInput): Promise<Event> {
    await this.cycleRepository.acquireChurchLock({
      churchId: input.churchId,
      tx,
    });

    const cycle = await this.ensureCycleWritable({
      cycle: await this.cycleRepository.getById({ ...input, tx }),
      churchTimeZone: church.timezone,
    });
    const event = await this.getCycleEvent({ input, tx });

    if (cycle.state === 'sent' && event.status !== 'draft') {
      throw new IllegalStateTransitionError({ from: event.status, to: action });
    }

    return event;
  }

  /** An Event under another Cycle is as missing as an unknown Event. */
  private async getCycleEvent({
    input,
    tx,
  }: GetCycleEventInput): Promise<Event> {
    const event = await this.eventRepository.getEvent({
      churchId: input.churchId,
      eventId: input.eventId,
      tx,
    });
    if (event.cycleId !== input.cycleId) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }
    return event;
  }

  private async loadWritableEventTimeBlock({
    input,
    church,
    action,
    tx,
  }: LoadWritableEventTimeBlockInput): Promise<EventTimeBlock> {
    await this.ensureWritableEvent({ input, church, action, tx });

    const eventTimeBlock = await this.eventTimeBlockRepository.getById({
      churchId: input.churchId,
      eventTimeBlockId: input.eventTimeBlockId,
      tx,
    });

    if (eventTimeBlock.eventId !== input.eventId) {
      throw new NotFoundError(
        `EventTimeBlock not found: ${input.eventTimeBlockId}`,
      );
    }

    return eventTimeBlock;
  }

  async deleteEvent(input: DeletePlanningEventManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.getCycleEvent({ input, tx });

      // Draft-only: a reopened Event of a Sent Cycle is no back door.
      if (cycle.state !== 'draft' || currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError({
          from: cycle.state === 'draft' ? currentEvent.status : cycle.state,
          to: 'delete',
        });
      }

      // Time blocks, shifts, draft assignments and audits cascade.
      await this.eventRepository.deleteEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        tx,
      });
    });
  }

  async cancelEvent(input: CancelPlanningEventManagerInput): Promise<void> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    await this.unitOfWork.run(async (tx) => {
      await this.cycleRepository.acquireChurchLock({
        churchId: input.churchId,
        tx,
      });

      const cycle = await this.ensureCycleWritable({
        cycle: await this.cycleRepository.getById({ ...input, tx }),
        churchTimeZone: church.timezone,
      });
      const currentEvent = await this.getCycleEvent({ input, tx });

      if (cycle.state === 'sent' && currentEvent.status !== 'draft') {
        throw new IllegalStateTransitionError({
          from: currentEvent.status,
          to: 'cancel',
        });
      }

      // A Draft Event is deleted (deleteEvent), never cancelled.
      if (currentEvent.status === 'draft') {
        throw new IllegalStateTransitionError({
          from: currentEvent.status,
          to: 'cancel',
        });
      }

      await this.eventRepository.updateEvent({
        churchId: input.churchId,
        eventId: input.eventId,
        status: 'cancelled',
        tx,
      });
    });
  }

  /** N10 add: one outbox row per recipient, in the planning transaction. */
  private async enqueueEventAdded({
    churchId,
    actingUserId,
    church,
    cycle,
    event,
    ministries,
    tx,
  }: EnqueueEventAddedInput): Promise<void> {
    const adminName =
      (await this.churchRepository.findUserName({
        userId: actingUserId,
      })) ?? '';
    const recipients = await this.recipients.eventChangedRecipients({
      tx,
      churchId,
      ministryIds: ministries.map(({ id }) => id),
      actingUserId,
    });
    for (const { ministryIds, ...recipient } of recipients) {
      await this.notifications.enqueue({
        tx,
        kind: 'event_changed',
        to: [recipient],
        data: {
          cycleId: cycle.id,
          cycleName: cycle.name,
          eventId: event.id,
          eventTitle: event.title,
          adminName,
          churchName: church.name,
          churchTimezone: church.timezone,
          ministries: ministries.filter(({ id }) => ministryIds.includes(id)),
          change: { kind: 'add', start: event.start, end: event.end },
        },
      });
    }
  }

  async previewMove(
    input: PreviewPlanningMoveManagerInput,
  ): Promise<PlanningMovePreview> {
    const church = await this.churchRepository.getById({ id: input.churchId });

    // No Church lock and no write: the preview is advisory.
    return this.unitOfWork.run((tx) => this.computeMove({ input, church, tx }));
  }

  async confirmMove(
    input: ConfirmPlanningMoveManagerInput,
  ): Promise<PlanningMoveResult> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    const { churchId, eventId, actingUserId } = input;

    return this.unitOfWork.run(async (tx) => {
      // Assignment creation takes this lock too, so no Assignment is created
      // against the bounds being rewritten, and the recalculated clashes
      // below see every committed Assignment.
      await this.cycleRepository.acquireChurchLock({ churchId, tx });
      // The removal lock: a racing leader removal or preparation save of
      // this Event commits before the recalculation reads.
      await this.eventRepository.lockParticipations({ churchId, eventId, tx });
      const { proposal, clashes } = await this.computeMove({
        input,
        church,
        tx,
      });

      // Kept Assignments stay on their Shifts, so their identity,
      // UnavailableShifts and open SwapRequests move with them.
      for (const { assignmentId } of clashes) {
        await removeAssignment({
          churchId,
          assignmentId,
          actorId: actingUserId,
          tx,
          assignmentRepository: this.assignmentRepository,
          auditRepository: this.auditRepository,
          swapRequestRepository: this.swapRequestRepository,
        });
      }
      const { start, end } = proposal.proposedEvent;
      const event = await this.eventRepository.updateEvent({
        churchId,
        eventId,
        start: toDate({ instant: start }),
        end: toDate({ instant: end }),
        tx,
      });
      const movedBlockIds = proposal.eventTimeBlocks.flatMap(
        ({ eventTimeBlockId, moved }) => (moved ? [eventTimeBlockId] : []),
      );
      await this.eventRepository.moveEventTimeBlocks({
        churchId,
        eventTimeBlockIds: movedBlockIds,
        deltaMs: proposal.deltaMs,
        tx,
      });
      const eventTimeBlocks = await this.eventTimeBlockRepository.listByEvent({
        churchId,
        eventId,
        tx,
      });
      return { graph: { event, eventTimeBlocks }, withdrawn: clashes };
    });
  }

  /**
   * The shared move computation for one scope: lifecycle and window refusals,
   * the proposed bounds and the active-Assignment clashes against the rest of
   * the Church. Reads only; the confirm path calls it again in its own
   * transaction, after taking the Church lock, to get the fresh result.
   */
  private async computeMove({
    input,
    church,
    tx,
  }: ComputeMoveInput): Promise<PlanningMovePreview> {
    const { churchId, eventId, scope, start } = input;
    const cycle = await this.ensureCycleWritable({
      cycle: await this.cycleRepository.getById({ ...input, tx }),
      churchTimeZone: church.timezone,
    });
    const event = await this.getCycleEvent({ input, tx });
    // Only a scheduled Event of a Sent Cycle moves; Draft has its own editor.
    if (cycle.state !== 'sent' || event.status !== 'scheduled') {
      throw new IllegalStateTransitionError({
        from: cycle.state === 'sent' ? event.status : cycle.state,
        to: 'move',
      });
    }

    const eventTimeBlocks = await this.eventTimeBlockRepository.listByEvent({
      churchId,
      eventId,
      tx,
    });
    if (
      scope.kind === 'eventTimeBlock' &&
      !eventTimeBlocks.some(({ id }) => id === scope.eventTimeBlockId)
    ) {
      throw new NotFoundError(
        `EventTimeBlock not found: ${scope.eventTimeBlockId}`,
      );
    }

    const proposal = proposeMove({
      scope,
      event,
      eventTimeBlocks,
      start: fromDate({ date: start }),
      now: now(),
      cycle,
      timeZone: church.timezone,
    });

    const scopeAssignments =
      await this.eventRepository.listMoveScopeAssignments({
        churchId,
        eventId,
        eventTimeBlockId:
          scope.kind === 'eventTimeBlock' ? scope.eventTimeBlockId : undefined,
        tx,
      });
    const movedBlocks = proposal.eventTimeBlocks.filter(({ moved }) => moved);
    const candidates = await this.eventRepository.listMoveClashCandidates({
      churchId,
      volunteerIds: [
        ...new Set(scopeAssignments.map(({ volunteerId }) => volunteerId)),
      ],
      excludedEventTimeBlockIds: movedBlocks.map(
        ({ eventTimeBlockId }) => eventTimeBlockId,
      ),
      // Every moved Shift lies inside the proposed Event bounds.
      startTime: toDate({ instant: proposal.proposedEvent.start }),
      endTime: toDate({ instant: proposal.proposedEvent.end }),
      tx,
    });

    return {
      proposal,
      clashes: findMoveClashes({
        deltaMs: proposal.deltaMs,
        scopeAssignments,
        candidates,
      }),
    };
  }

  private async ensureCycleWritable({
    cycle,
    churchTimeZone,
  }: EnsureCycleWritableInput): Promise<Cycle> {
    if (cycle.state === 'past') {
      throw new IllegalStateTransitionError({
        from: cycle.state,
        to: 'mutate',
      });
    }

    const churchToday = today({ instant: now(), timeZone: churchTimeZone });

    // endDate is the Cycle's last day: writes stay open through it.
    if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) > 0) {
      await this.cycleRepository.updateState({
        churchId: cycle.churchId,
        cycleId: cycle.id,
        state: 'past',
      });
      throw new IllegalStateTransitionError({ from: 'past', to: 'mutate' });
    }

    return cycle;
  }
}

interface ListInOrderInput {
  churchId: ChurchId;
  eventId: EventId;
  blockIds: EventTimeBlockId[];
  tx: TransactionContext;
}

/** A create or edit request as the shared final-graph validator reads it. */
function toProposedGraph({
  start,
  end,
  eventTimeBlocks,
}:
  | CreatePlanningEventManagerInput
  | UpdatePlanningEventManagerInput): EventGraph {
  return {
    start: fromDate({ date: start }),
    end: fromDate({ date: end }),
    eventTimeBlocks: eventTimeBlocks.map((block) => ({
      id: 'id' in block ? block.id : undefined,
      label: block.label,
      startTime: fromDate({ date: block.startTime }),
      endTime: fromDate({ date: block.endTime }),
    })),
  };
}
