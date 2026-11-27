import { NotFoundError } from '@church/core';
import { compareCalendarDays, compareInstants, now, today } from '@church/time';
import type { IParticipationReader } from '../domain/contracts/application/participation-reader';
import type {
  ApplyPreparationGraphInput,
  ApplyShiftChangeInput,
  AssertHeadcountFloorsInput,
  AssertNoShiftResponsesInput,
  BuildEventViewInput,
  CountByInput,
  CountShiftResponsesInput,
  CycleParticipationView,
  DbPrepareManagerDependencies,
  DiffShiftsInput,
  DiscardPreparationInput,
  EnsurePreparationEditableInput,
  GetCycleParticipationInput,
  GroupByInput,
  IPrepareManager,
  LoadConfirmedVolunteerIdsInput,
  LoadEventViewInput,
  LoadPreparationViewInput,
  LoadShiftResponsesInput,
  OptInPreparationInput,
  ParticipationEventTimeBlockView,
  ParticipationEventView,
  ParticipationShiftView,
  ReconcileRequirementsInput,
  RequirementPlace,
  ResolveParticipationEventTimeBlockInput,
  SavePreparationInput,
  ShiftChange,
  ShiftResponses,
} from '../domain/contracts/application/prepare-manager';
import type { IUsualSetupStaffingSeeder } from '../domain/contracts/application/usual-setup-staffing-seeder';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '../domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { isActiveAssignmentStatus } from '../domain/entities/assignment';
import type { EventTimeBlock } from '../domain/entities/event-time-block';
import {
  assertUniqueHeadcounts,
  assertValidHeadcounts,
} from '../domain/entities/usual-setup';
import { IllegalStateTransitionError } from '../domain/errors';
import { HeadcountBelowAssignedError } from '../domain/errors/headcount-below-assigned';
import { InvalidShiftIndexError } from '../domain/errors/invalid-shift-index';
import { InvalidShiftSplitError } from '../domain/errors/invalid-shift-split';
import { PreparationEmptyError } from '../domain/errors/preparation-empty';
import { ShiftHasResponsesError } from '../domain/errors/shift-has-responses';
import {
  assertEventTimeBlockNotCancelled,
  isEventTimeBlockCancelled,
} from '../domain/event-time-block-cancellation';
import { ShiftSplitter } from '../domain/services/shift-splitter';
import { spansFitBlock } from '../domain/services/usual-setup-planner';
import { filterCycleParticipation } from './participation-view-filter';

/**
 * Every stage accepts edits, so a published Schedule can prepare an Event added
 * to its Sent Cycle; answered Shifts stay guarded and Send updates tells the rest.
 * Elapsed or unsent Cycles refuse.
 */
function ensurePreparationEditable({
  cycle,
  timeZone,
}: EnsurePreparationEditableInput): void {
  const to = 'save_preparation';
  const currentInstant = now();
  const churchToday = today({ instant: currentInstant, timeZone });
  // endDate is the Cycle's last day: edits stay open through it.
  if (compareCalendarDays({ left: churchToday, right: cycle.endDate }) > 0) {
    throw new IllegalStateTransitionError({ from: 'past', to });
  }
  if (cycle.state !== 'sent') {
    throw new IllegalStateTransitionError({ from: cycle.state, to });
  }
}

function diffShifts({
  existingShifts,
  desiredShifts,
}: DiffShiftsInput): ShiftChange {
  const shifts = desiredShifts.map(
    (desired) =>
      existingShifts.find(
        (existing) =>
          compareInstants({
            left: existing.startTime,
            right: desired.startTime,
          }) === 0 &&
          compareInstants({
            left: existing.endTime,
            right: desired.endTime,
          }) === 0,
      ) ?? desired,
  );
  return {
    shifts,
    added: shifts.filter((shift) => !existingShifts.includes(shift)),
    removed: existingShifts.filter((shift) => !shifts.includes(shift)),
  };
}

function countShiftResponses({
  marks,
  assignments,
}: CountShiftResponsesInput): ShiftResponses {
  const activeAssignments = assignments.filter((assignment) =>
    isActiveAssignmentStatus(assignment.status),
  );
  return {
    markCountByShift: countBy({
      keys: marks.map((mark) => mark.shiftId as string),
    }),
    assignmentCountByShift: countBy({
      keys: activeAssignments.map((assignment) => assignment.shiftId as string),
    }),
    assignedCountByRequirement: countBy({
      keys: activeAssignments.map(
        (assignment) => assignment.shiftRequirementId as string,
      ),
    }),
  };
}

function assertNoShiftResponses({
  shifts,
  responses: { markCountByShift, assignmentCountByShift },
}: AssertNoShiftResponsesInput): void {
  const shiftResponses = shifts
    .map(({ id: shiftId }) => ({
      shiftId,
      unavailableMarkCount: markCountByShift.get(shiftId as string) ?? 0,
      assignmentCount: assignmentCountByShift.get(shiftId as string) ?? 0,
    }))
    .filter(
      ({ unavailableMarkCount, assignmentCount }) =>
        unavailableMarkCount > 0 || assignmentCount > 0,
    );
  if (shiftResponses.length > 0) {
    throw new ShiftHasResponsesError({ shiftResponses });
  }
}

function assertHeadcountFloors({
  current,
  desired,
  responses: { assignedCountByRequirement },
}: AssertHeadcountFloorsInput): void {
  const neededByPlace = new Map(
    desired.map((place) => [placeOf(place), place.peopleNeeded]),
  );
  const headcountFloors = current.flatMap((requirement) => {
    const { shiftId, sectorId, roleId } = requirement;
    const assignedCount =
      assignedCountByRequirement.get(requirement.id as string) ?? 0;
    const needed = neededByPlace.get(placeOf(requirement)) ?? 0;
    return shiftId && needed < assignedCount
      ? [{ shiftId, sectorId, roleId, assignedCount }]
      : [];
  });
  if (headcountFloors.length > 0) {
    throw new HeadcountBelowAssignedError({ headcountFloors });
  }
}

function placeOf({ shiftId, sectorId, roleId }: RequirementPlace): string {
  return `${shiftId}:${sectorId}:${roleId}`;
}

function buildEventView({
  eventGroup,
  participation,
  includedEventTimeBlockIds,
  shifts,
  requirements,
  marks,
  assignments,
  availabilityRequestedAt,
  confirmedVolunteerIds,
}: BuildEventViewInput): ParticipationEventView {
  const {
    markCountByShift,
    assignmentCountByShift,
    assignedCountByRequirement,
  } = countShiftResponses({ marks, assignments });

  const shiftsByEventTimeBlock = groupBy({
    items: shifts,
    keyOf: (shift) => shift.eventTimeBlockId as string,
  });
  const requirementsByShift = groupBy({
    items: requirements,
    keyOf: (requirement) => (requirement.shiftId ?? '') as string,
  });

  const marksByShift = groupBy({
    items: marks,
    keyOf: (mark) => mark.shiftId as string,
  });

  const eventTimeBlocks: ParticipationEventTimeBlockView[] =
    eventGroup.eventTimeBlocks.map((eventTimeBlock) => {
      const eventTimeBlockShifts =
        shiftsByEventTimeBlock.get(eventTimeBlock.id as string) ?? [];
      const shiftViews: ParticipationShiftView[] = eventTimeBlockShifts.map(
        (shift) => {
          const shiftRequirements = (
            requirementsByShift.get(shift.id as string) ?? []
          ).map((requirement) => ({
            requirement,
            assignedCount:
              assignedCountByRequirement.get(requirement.id as string) ?? 0,
          }));

          return {
            shift,
            requirements: shiftRequirements,
            unavailableMarkCount: markCountByShift.get(shift.id as string) ?? 0,
            assignmentCount:
              assignmentCountByShift.get(shift.id as string) ?? 0,
            flagged: shiftRequirements.length === 0,
          };
        },
      );

      // Available = confirmed and unmarked on every Shift of the block; needed =
      // the busiest Shift's headcount, null while a Shift has none (or there is no Shift).
      const unavailable = new Set(
        eventTimeBlockShifts.flatMap((shift) =>
          (marksByShift.get(shift.id as string) ?? []).map(
            (mark) => mark.volunteerId as string,
          ),
        ),
      );
      const cancelled = isEventTimeBlockCancelled({
        event: eventGroup.event,
        eventTimeBlock,
      });
      const headcounts = shiftViews.map(({ requirements: shiftRequirements }) =>
        shiftRequirements.reduce(
          (sum, { requirement }) => sum + requirement.peopleNeeded,
          0,
        ),
      );

      return {
        eventTimeBlock,
        included: includedEventTimeBlockIds.has(eventTimeBlock.id as string),
        cancelled,
        answerCoverage: {
          available: [...confirmedVolunteerIds].filter(
            (id) => !unavailable.has(id),
          ).length,
          needed:
            cancelled || headcounts.length === 0 || headcounts.includes(0)
              ? null
              : Math.max(...headcounts),
        },
        shifts: shiftViews,
        requirements: shiftViews.flatMap((view) => view.requirements),
        shiftsChangedAfterAsk:
          availabilityRequestedAt !== null &&
          eventTimeBlockShifts.some(
            (shift) => shift.createdAt > availabilityRequestedAt,
          ),
      };
    });

  return {
    participation,
    event: eventGroup.event,
    generatedFromTemplate: eventGroup.event.sourceTemplateId !== undefined,
    eventTimeBlocks,
  };
}

function countBy({ keys }: CountByInput): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function groupBy<Item>({
  items,
  keyOf,
}: GroupByInput<Item>): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

export class DbPrepareManager implements IPrepareManager {
  private readonly splitter = new ShiftSplitter();

  private readonly assignmentRepository: AssignmentRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly cycleRepository: CycleRepository;
  private readonly eventRepository: PlanningEventRepository;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly staffingSeeder: IUsualSetupStaffingSeeder;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly participationReader: IParticipationReader;

  constructor({
    assignmentRepository,
    churchRepository,
    cycleRepository,
    eventRepository,
    eventTimeBlockRepository,
    ministryRepository,
    participationRepository,
    shiftRepository,
    staffingSeeder,
    unavailableShiftRepository,
    unitOfWork,
    participationReader,
  }: DbPrepareManagerDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.churchRepository = churchRepository;
    this.cycleRepository = cycleRepository;
    this.eventRepository = eventRepository;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.ministryRepository = ministryRepository;
    this.participationRepository = participationRepository;
    this.shiftRepository = shiftRepository;
    this.staffingSeeder = staffingSeeder;
    this.unavailableShiftRepository = unavailableShiftRepository;
    this.unitOfWork = unitOfWork;
    this.participationReader = participationReader;
  }

  async getCycleParticipation(
    input: GetCycleParticipationInput,
  ): Promise<CycleParticipationView> {
    const ministry = await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });
    // Prepare excludes archived Ministries even when participation already exists.
    if (ministry.deletedAt)
      throw new NotFoundError(`Ministry not found: ${input.ministryId}`);
    await this.cycleRepository.getById({
      churchId: input.churchId,
      cycleId: input.cycleId,
    });
    const church = await this.churchRepository.getById({
      id: input.churchId,
    });

    return this.unitOfWork.run(async (tx) => {
      const eventGroups = await this.eventRepository.listCycleEvents({
        churchId: input.churchId,
        cycleId: input.cycleId,
        shownOnly: true,
        tx,
      });
      const availabilityRequestedAt =
        await this.participationRepository.findAvailabilityRequestedAt({
          churchId: input.churchId,
          cycleId: input.cycleId,
          ministryId: input.ministryId,
          tx,
        });
      const confirmedVolunteerIds = await this.loadConfirmedVolunteerIds({
        ...input,
        tx,
      });
      const events: ParticipationEventView[] = [];

      for (const eventGroup of eventGroups) {
        const participation =
          await this.participationReader.getOrCreateParticipation({
            ...input,
            eventId: eventGroup.event.id,
            tx,
          });
        events.push(
          await this.loadEventView({
            churchId: input.churchId,
            eventGroup,
            participation,
            availabilityRequestedAt,
            confirmedVolunteerIds,
            tx,
          }),
        );
      }

      const filtered = filterCycleParticipation({
        events,
        filters: input.filters ?? {},
        timeZone: church.timezone,
      });
      return {
        events: filtered.events,
        dayMarkers: filtered.dayMarkers,
        totals: {
          blocks: filtered.totalBlocks,
          needsAttention: filtered.needsAttentionBlocks,
        },
      };
    });
  }

  private async loadEventView({
    churchId,
    eventGroup,
    participation,
    availabilityRequestedAt,
    confirmedVolunteerIds,
    tx,
  }: LoadEventViewInput): Promise<ParticipationEventView> {
    const scope = { churchId, participationId: participation.id, tx };
    const [inclusions, shifts, requirements, marks, assignments] =
      await Promise.all([
        this.participationRepository.listInclusions(scope),
        this.shiftRepository.listByParticipation(scope),
        this.shiftRepository.listRequirementsByParticipation(scope),
        this.unavailableShiftRepository.listByParticipation(scope),
        this.assignmentRepository.listByParticipation(scope),
      ]);

    return buildEventView({
      eventGroup,
      participation,
      includedEventTimeBlockIds: new Set(
        inclusions.map((inclusion) => inclusion.eventTimeBlockId as string),
      ),
      shifts,
      requirements,
      marks,
      assignments,
      availabilityRequestedAt,
      confirmedVolunteerIds,
    });
  }

  private async loadConfirmedVolunteerIds({
    churchId,
    cycleId,
    ministryId,
    tx,
  }: LoadConfirmedVolunteerIdsInput): Promise<Set<string>> {
    const states = await this.participationReader.loadCheckStates({
      churchId,
      ministryId,
      cycleId,
      tx,
    });
    return new Set(
      [...states]
        .filter(([, state]) => state === 'confirmed')
        .map(([id]) => id),
    );
  }

  async savePreparation({
    churchId,
    participationId,
    eventTimeBlockId,
    serves,
    shiftSplit,
    headcounts,
  }: SavePreparationInput): Promise<ParticipationEventTimeBlockView> {
    const { timezone: timeZone } = await this.churchRepository.getById({
      id: churchId,
    });

    return this.unitOfWork.run(async (tx) => {
      // Serializes saves of this participation and holds its state until commit.
      const participation = await this.participationRepository.lockById({
        churchId,
        participationId,
        tx,
      });
      // An archived Ministry is not found for new use.
      await this.ministryRepository.lockActive({
        churchId,
        ministryId: participation.ministryId,
        strength: 'share',
        tx,
      });
      const eventTimeBlock = await this.resolveParticipationEventTimeBlock({
        churchId,
        participation,
        eventTimeBlockId,
        tx,
      });
      const event = await this.eventRepository.getEvent({
        churchId,
        eventId: participation.eventId,
        tx,
      });
      const cycle = await this.cycleRepository.getById({
        churchId,
        cycleId: event.cycleId,
        tx,
      });
      ensurePreparationEditable({ cycle, timeZone });
      assertEventTimeBlockNotCancelled({ event, eventTimeBlock });

      const target = { churchId, participation, eventTimeBlock, tx };
      // Locked so a racing answer or Assignment is counted below, never cascaded away.
      const existingShifts = await this.shiftRepository.listByEventTimeBlock({
        churchId,
        participationId,
        eventTimeBlockId,
        forUpdate: true,
        tx,
      });

      if (!serves) {
        await this.discardPreparation({ ...target, existingShifts });
      } else if (
        existingShifts.length === 0 &&
        !shiftSplit &&
        headcounts === undefined
      ) {
        await this.optInPreparation({ ...target, timeZone });
      } else {
        await this.applyPreparationGraph({
          ...target,
          existingShifts,
          shiftSplit,
          headcounts: headcounts ?? [],
        });
      }

      await this.participationRepository.touch({
        churchId,
        participationId,
        tx,
      });

      return this.loadPreparationView({ ...target, event });
    });
  }

  private async discardPreparation({
    churchId,
    participation,
    eventTimeBlock,
    existingShifts,
    tx,
  }: DiscardPreparationInput): Promise<void> {
    const block = {
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    };
    assertNoShiftResponses({
      shifts: existingShifts,
      responses: await this.loadShiftResponses(block),
    });
    await this.shiftRepository.deleteByEventTimeBlock(block);
    await this.participationRepository.removeInclusion(block);
  }

  /** Re-seeds from a serving Usual setup entry, else one whole-block Shift that reads flagged. */
  private async optInPreparation({
    churchId,
    participation,
    eventTimeBlock,
    timeZone,
    tx,
  }: OptInPreparationInput): Promise<void> {
    const seeded = await this.staffingSeeder.seedParticipationBlock({
      churchId,
      participation,
      block: {
        eventId: eventTimeBlock.eventId,
        eventTimeBlockId: eventTimeBlock.id,
        sourceTemplateTimeBlockId: eventTimeBlock.sourceTemplateTimeBlockId,
        startTime: eventTimeBlock.startTime,
        endTime: eventTimeBlock.endTime,
      },
      setup: await this.staffingSeeder.loadSetup({ churchId, timeZone, tx }),
      tx,
    });
    if (seeded) return;

    await this.participationRepository.addInclusion({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    });
    const shifts = this.splitter.split({
      churchId,
      participationId: participation.id,
      eventTimeBlock,
      strategy: { kind: 'equal-n', n: 1 },
    });
    await this.shiftRepository.createMany({ churchId, shifts, tx });
  }

  /** Validates the submitted graph completely, then writes it over the block. */
  private async applyPreparationGraph({
    existingShifts,
    shiftSplit,
    headcounts,
    ...target
  }: ApplyPreparationGraphInput): Promise<void> {
    const { churchId, participation, eventTimeBlock, tx } = target;
    // A zero row is an omission, but it still may not repeat a place.
    assertUniqueHeadcounts({ headcounts });
    if (!shiftSplit) {
      throw new PreparationEmptyError();
    }
    const positive = headcounts.filter(({ peopleNeeded }) => peopleNeeded > 0);
    assertValidHeadcounts({ headcounts: positive });
    if (
      shiftSplit.kind === 'manual' &&
      !spansFitBlock({ spans: shiftSplit.spans, block: eventTimeBlock })
    ) {
      throw new InvalidShiftSplitError(
        'manual spans must be chronological, must not overlap and must lie within the block',
      );
    }
    const desiredShifts = this.splitter.split({
      churchId,
      participationId: participation.id,
      eventTimeBlock,
      strategy: shiftSplit,
    });
    if (positive.some(({ shiftIndex }) => shiftIndex >= desiredShifts.length)) {
      throw new InvalidShiftIndexError();
    }

    const change = diffShifts({ existingShifts, desiredShifts });
    const participationId = participation.id;
    const responses = await this.loadShiftResponses({
      churchId,
      participationId,
      tx,
    });
    assertNoShiftResponses({
      // Flow 6: adding beside an answered Shift is a re-split whatever its shape;
      // a pure delete affects only the Shifts it removes.
      shifts: change.added.length > 0 ? existingShifts : change.removed,
      responses,
    });
    const shiftIds = new Set<string | undefined>(
      change.shifts.map((shift) => shift.id),
    );
    const allRequirements =
      await this.shiftRepository.listRequirementsByParticipation({
        churchId,
        participationId,
        tx,
      });
    const current = allRequirements.filter((requirement) =>
      shiftIds.has(requirement.shiftId),
    );
    const desired = positive.flatMap(({ shiftIndex, ...headcount }) => {
      const shift = change.shifts[shiftIndex];
      return shift ? [{ ...headcount, shiftId: shift.id }] : [];
    });
    assertHeadcountFloors({ current, desired, responses });
    if (positive.length === 0) {
      throw new PreparationEmptyError();
    }
    await this.participationReader.assertMinistryHeadcounts({
      churchId,
      ministryId: participation.ministryId,
      headcounts: positive,
      tx,
    });

    await this.applyShiftChange({
      ...target,
      desiredShifts,
      change,
      updateLabels: shiftSplit.kind === 'manual',
    });
    await this.participationRepository.addInclusion({
      churchId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlock.id,
      tx,
    });
    await this.reconcileRequirements({ ...target, current, desired });
  }

  private async loadShiftResponses({
    churchId,
    participationId,
    tx,
  }: LoadShiftResponsesInput): Promise<ShiftResponses> {
    const scope = { churchId, participationId, tx };
    const [marks, assignments] = await Promise.all([
      this.unavailableShiftRepository.listByParticipation(scope),
      this.assignmentRepository.listByParticipation(scope),
    ]);
    return countShiftResponses({ marks, assignments });
  }

  /** The same spans keep their Shifts, so answers and Assignments stay attached. */
  private async applyShiftChange({
    churchId,
    desiredShifts,
    updateLabels,
    change: { shifts, added, removed },
    tx,
  }: ApplyShiftChangeInput): Promise<void> {
    for (const { id: shiftId } of removed) {
      await this.shiftRepository.deleteById({ churchId, shiftId, tx });
    }
    await this.shiftRepository.createMany({ churchId, shifts: added, tx });
    // Equal splits cannot express labels; only the manual editor can change them.
    if (!updateLabels) return;
    for (const [index, shift] of shifts.entries()) {
      const label = desiredShifts[index]?.label;
      if (added.includes(shift) || shift.label === label) continue;
      await this.shiftRepository.update({
        churchId,
        shiftId: shift.id,
        label: label ?? null,
        tx,
      });
    }
  }

  /** Omission removes a requirement; a kept pair keeps its id and notes. */
  private async reconcileRequirements({
    churchId,
    participation,
    current,
    desired,
    tx,
  }: ReconcileRequirementsInput): Promise<void> {
    const participationId = participation.id;
    const desiredPlaces = new Set(desired.map(placeOf));

    await this.shiftRepository.deleteRequirements({
      churchId,
      shiftRequirementIds: current
        .filter((requirement) => !desiredPlaces.has(placeOf(requirement)))
        .map((requirement) => requirement.id),
      tx,
    });

    const notesByPlace = new Map(
      current.map((requirement) => [placeOf(requirement), requirement.notes]),
    );
    for (const place of desired) {
      await this.shiftRepository.saveRequirement({
        ...place,
        churchId,
        participationId,
        notes: notesByPlace.get(placeOf(place)),
        tx,
      });
    }
  }

  private async loadPreparationView({
    churchId,
    participation,
    eventTimeBlock,
    event,
    tx,
  }: LoadPreparationViewInput): Promise<ParticipationEventTimeBlockView> {
    const availabilityRequestedAt =
      await this.participationRepository.findAvailabilityRequestedAt({
        churchId,
        cycleId: event.cycleId,
        ministryId: participation.ministryId,
        tx,
      });
    const { eventTimeBlocks } = await this.loadEventView({
      churchId,
      eventGroup: { event, eventTimeBlocks: [eventTimeBlock] },
      participation,
      availabilityRequestedAt,
      confirmedVolunteerIds: await this.loadConfirmedVolunteerIds({
        churchId,
        cycleId: event.cycleId,
        ministryId: participation.ministryId,
        tx,
      }),
      tx,
    });
    const [view] = eventTimeBlocks;
    if (!view) {
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlock.id}`);
    }
    return view;
  }

  private async resolveParticipationEventTimeBlock({
    churchId,
    participation,
    eventTimeBlockId,
    tx,
  }: ResolveParticipationEventTimeBlockInput): Promise<EventTimeBlock> {
    const eventTimeBlock = await this.eventTimeBlockRepository.getById({
      churchId,
      eventTimeBlockId,
      tx,
    });

    // Another Event's EventTimeBlock is as missing as an unknown one.
    if (eventTimeBlock.eventId !== participation.eventId) {
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`);
    }

    return eventTimeBlock;
  }
}
