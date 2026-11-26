import { NotFoundError } from '@church/core';
import { compareCalendarDays, compareInstants, now, today } from '@church/time';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
import type { IScheduleChangeReader } from '../domain/contracts/application/schedule-change-reader';
import type {
  DbSchedulePublisherDependencies,
  ISchedulePublisher,
  NotifySchedulePublishedInput,
  PublishCandidate,
  PublishCycleInput,
  PublishCycleParticipationOutcome,
  PublishCycleView,
  SendScheduleUpdatesView,
  TagCoveredSwapRequestsInput,
} from '../domain/contracts/application/schedule-publisher';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type {
  MinistryParticipationRepository,
  ScheduleLastToldRow,
} from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import { IllegalStateTransitionError } from '../domain/errors';
import {
  NoUnsentChangesError,
  ScheduleAlreadyPublishedError,
  ScheduleHasNoAssignmentsError,
} from '../domain/errors/schedule-publish';
import type { ScheduleAssignmentSnapshot } from '../domain/schedule-last-told';

function toPublishCycleOutcome(
  candidate: PublishCandidate,
): PublishCycleParticipationOutcome {
  return {
    participationId: candidate.participation.id,
    state: candidate.participation.state,
    peopleNeeded: candidate.completion.peopleNeeded,
    assignedCount: candidate.completion.assignedCount,
  };
}

export class DbSchedulePublisher implements ISchedulePublisher {
  private readonly churchRepository: ChurchRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly notifications: IChurchNotifications;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly swapRequestRepo: SwapRequestRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly scheduleChangeReader: IScheduleChangeReader;

  constructor({
    churchRepository,
    cycleRepository,
    eventRepository,
    ministryRepository,
    notifications,
    participationRepository,
    swapRequestRepo,
    unitOfWork,
    volunteerRepository,
    scheduleChangeReader,
  }: DbSchedulePublisherDependencies) {
    this.churchRepository = churchRepository;
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.ministryRepository = ministryRepository;
    this.notifications = notifications;
    this.participationRepository = participationRepository;
    this.swapRequestRepo = swapRequestRepo;
    this.unitOfWork = unitOfWork;
    this.volunteerRepository = volunteerRepository;
    this.scheduleChangeReader = scheduleChangeReader;
  }

  async publishCycle(input: PublishCycleInput): Promise<PublishCycleView> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    const cycle = await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });

    const church = await this.churchRepository.getById({ id: input.churchId });
    if (
      cycle.state !== 'sent' ||
      compareCalendarDays({
        left: cycle.endDate,
        right: today({ instant: now(), timeZone: church.timezone }),
      }) < 0
    ) {
      throw new IllegalStateTransitionError({
        from: cycle.state,
        to: 'published',
      });
    }

    return this.unitOfWork.run(async (tx) => {
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });

      // Use the shared Schedule lock order used by other Schedule mutations.
      const lockedParticipations =
        await this.participationRepository.lockSchedule({
          churchId: input.churchId,
          ministryId: input.ministryId,
          cycleId: input.cycleId,
          tx,
        });

      // Only availability-requested / assign participations are publishable;
      // prepare ones are not yet assigned and already-published ones are
      // reported unchanged.
      const publishable: PublishCandidate[] = [];
      const alreadyPublished: PublishCandidate[] = [];

      for (const eventGroup of eventGroups) {
        if (eventGroup.event.status === 'cancelled') continue;
        const participation = lockedParticipations.find(
          (item) => item.eventId === eventGroup.event.id,
        );
        if (!participation) continue;
        const completion =
          await this.scheduleChangeReader.readParticipationCompletion({
            churchId: input.churchId,
            participationId: participation.id,
            tx,
          });
        if (participation.state === 'published') {
          alreadyPublished.push({ participation, completion });
        } else if (
          participation.state === 'availability_requested' ||
          participation.state === 'assigning'
        ) {
          publishable.push({ participation, completion });
        }
      }

      if (publishable.length === 0 && alreadyPublished.length > 0) {
        throw new ScheduleAlreadyPublishedError();
      }
      if (publishable.length === 0) {
        throw new IllegalStateTransitionError({
          from: 'prepare',
          to: 'published',
        });
      }
      if (
        ![...publishable, ...alreadyPublished].some(
          ({ completion }) => completion.assignedCount > 0,
        )
      ) {
        throw new ScheduleHasNoAssignmentsError();
      }

      const anyBelowFull = publishable.some(
        (candidate) => candidate.completion.completionPercent < 100,
      );

      // Below-full without confirmation: reject the whole batch, no writes.
      if (anyBelowFull && input.confirmBelowFull !== true) {
        return {
          published: false,
          belowFull: true,
          participations: [...publishable, ...alreadyPublished].map(
            toPublishCycleOutcome,
          ),
        };
      }

      for (const { participation, completion } of publishable) {
        if (participation.state === 'availability_requested') {
          participation.startAssigning();
        }
        participation.publish({
          completionPercent: completion.completionPercent,
          confirmBelowFull: true,
        });
        await this.participationRepository.updateState({
          churchId: input.churchId,
          participationId: participation.id,
          state: participation.state,
          tx,
        });
      }

      await this.notifySchedulePublished({
        input,
        candidates: [...publishable, ...alreadyPublished],
        events: eventGroups,
        tx,
      });

      return {
        published: true,
        belowFull: anyBelowFull,
        participations: [...publishable, ...alreadyPublished].map(
          toPublishCycleOutcome,
        ),
      };
    });
  }

  async sendScheduleUpdates(
    input: PublishCycleInput,
  ): Promise<SendScheduleUpdatesView> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });
    return this.unitOfWork.run(async (tx) => {
      const participations = await this.participationRepository.lockSchedule({
        ...input,
        tx,
      });
      if (participations.length === 0)
        throw new NotFoundError('Schedule not found');
      const events = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      });
      const published = participations.filter(
        (item) =>
          item.state === 'published' &&
          events.some(
            ({ event }) =>
              event.id === item.eventId && event.status !== 'cancelled',
          ),
      );
      const current =
        await this.scheduleChangeReader.collectScheduleAssignments({
          input,
          participations: published,
          events,
          tx,
        });
      const lastTold = await this.participationRepository.listScheduleLastTold({
        ...input,
        tx,
      });
      const baseline = await this.tagCoveredSwapRequests({
        baseline: lastTold,
        churchId: input.churchId,
        tx,
      });
      const changed = this.scheduleChangeReader.compareScheduleAssignments({
        events,
        baseline,
        current,
        at: now(),
      });
      if (changed.length === 0) throw new NoUnsentChangesError();
      const [church, ministry, cycle, volunteers] = await Promise.all([
        this.churchRepository.getById({ id: input.churchId, tx }),
        this.ministryRepository.getById({
          churchId: input.churchId,
          id: input.ministryId,
          tx,
        }),
        this.cycleRepository.getById({
          churchId: input.churchId,
          cycleId: input.cycleId,
          tx,
        }),
        this.volunteerRepository.listByIds({
          churchId: input.churchId,
          ids: changed.map(({ id }) => id),
          tx,
        }),
      ]);
      if (volunteers.length !== changed.length)
        throw new NotFoundError('An assigned Volunteer could not be found');
      const ids = new Set([
        ...baseline.map(({ volunteerId }) => volunteerId),
        ...current.keys(),
      ]);
      for (const id of ids) {
        await this.participationRepository.saveScheduleLastTold({
          churchId: input.churchId,
          ministryId: input.ministryId,
          cycleId: input.cycleId,
          volunteerId: id,
          assignments: current.get(id) ?? [],
          tx,
        });
      }
      for (const volunteer of volunteers) {
        const changes = changed.find(({ id }) => id === volunteer.id)?.changes;
        if (!changes) throw new NotFoundError('Volunteer changes not found');
        await this.notifications.enqueue({
          tx,
          kind: 'schedule_updated',
          to: [{ userId: volunteer.userId, churchId: input.churchId }],
          data: {
            cycleId: cycle.id,
            cycleName: cycle.name,
            ministryId: ministry.id,
            ministryName: ministry.name,
            churchName: church.name,
            churchTimezone: church.timezone,
            changes,
          },
        });
      }
      return { notifiedCount: changed.length };
    });
  }

  /** A told Assignment whose latest request was covered after the last send is being changed by that cover. */
  private async tagCoveredSwapRequests({
    baseline,
    churchId,
    tx,
  }: TagCoveredSwapRequestsInput): Promise<ScheduleLastToldRow[]> {
    const tagRow = async (row: ScheduleLastToldRow) => {
      const tagItem = async (item: ScheduleAssignmentSnapshot) => {
        const latest = await this.swapRequestRepo.findLatestByAssignment({
          churchId,
          assignmentId: item.assignmentId,
          tx,
        });
        const coveredSinceTold =
          latest?.status === 'covered' &&
          latest.closedAt !== undefined &&
          compareInstants({ left: latest.closedAt, right: row.toldAt }) > 0;
        return coveredSinceTold ? { ...item, swapRequestCovered: true } : item;
      };
      const assignments = await Promise.all(row.assignments.map(tagItem));
      return { ...row, assignments };
    };
    return Promise.all(baseline.map(tagRow));
  }

  private async notifySchedulePublished({
    input,
    candidates,
    events,
    tx,
  }: NotifySchedulePublishedInput): Promise<void> {
    const [church, ministry, cycle] = await Promise.all([
      this.churchRepository.getById({ id: input.churchId, tx }),
      this.ministryRepository.getById({
        churchId: input.churchId,
        id: input.ministryId,
        tx,
      }),
      this.cycleRepository.getById({
        churchId: input.churchId,
        cycleId: input.cycleId,
        tx,
      }),
    ]);
    const byVolunteer =
      await this.scheduleChangeReader.collectScheduleAssignments({
        input,
        participations: candidates.map(({ participation }) => participation),
        events,
        tx,
      });
    const volunteers = await this.volunteerRepository.listByIds({
      churchId: input.churchId,
      ids: [...byVolunteer.keys()],
      tx,
    });
    if (volunteers.length !== byVolunteer.size) {
      throw new NotFoundError('An assigned Volunteer could not be found');
    }
    for (const volunteer of volunteers) {
      const assignments = byVolunteer.get(volunteer.id);
      if (!assignments) continue;
      await this.participationRepository.saveScheduleLastTold({
        churchId: input.churchId,
        ministryId: input.ministryId,
        cycleId: input.cycleId,
        volunteerId: volunteer.id,
        assignments,
        tx,
      });
      await this.notifications.enqueue({
        tx,
        kind: 'schedule_published',
        to: [{ userId: volunteer.userId, churchId: input.churchId }],
        data: {
          cycleId: cycle.id,
          cycleName: cycle.name,
          ministryId: ministry.id,
          ministryName: ministry.name,
          churchName: church.name,
          churchTimezone: church.timezone,
          shifts: assignments.map(
            ({ eventTitle, startsAt, endsAt, roleName, sectorName }) => ({
              eventTitle,
              startsAt,
              endsAt,
              roleName,
              sectorName,
            }),
          ),
        },
      });
    }
  }
}
