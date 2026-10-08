import {
  addCalendarDays,
  type CalendarDay,
  compareInstants,
  enumerateCalendarDays,
  type Instant,
  parseTimeOfDay,
  today,
  toInstant,
  weekdayIndex,
} from '@church/time';
import type {
  ChurchDirectoryBlueprint,
  MinistryBlueprint,
} from '../blueprints/directory/types';
import type {
  GatheringBlockKey,
  GatheringsBlueprint,
  StaffingNeed,
} from '../blueprints/gatherings';
import type {
  GatheringRef,
  HistoryBlueprint,
  ServicePost,
} from '../blueprints/history';
import {
  buildConfirmedAvailabilityCheck,
  buildUnavailabilityMark,
} from '../builders/availability';
import { deriveSeedId } from '../builders/derived-id';
import {
  buildVolunteerNotification,
  type VolunteerNotificationType,
} from '../builders/notification';
import {
  type AssignmentStatus,
  buildAssignment,
  buildAssignmentAudit,
  buildEvent,
  buildMinistryParticipation,
  buildPlanningCycle,
  buildShift,
  buildSlotRequirement,
  buildTimeSlot,
} from '../builders/scheduling';
import { historicalCycleWindow } from '../development/history-window';
import type { SeedWriter } from '../recipe';
import {
  requireMinistry,
  resolveStaffingNeed,
  type SeededGatherings,
  type SeededMinistryStructure,
} from './development-gatherings';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/** When the leaders confirmed availability and rostered, before the month. */
const AVAILABILITY_CONFIRMED_DAYS_BEFORE = 10;
const ROSTERED_DAYS_BEFORE = 5;
/** When every participation was published, the day after rostering. */
const PUBLISHED_DAYS_BEFORE = 4;
/** When a replacement or reassignment was made, before its gathering. */
const REPLACED_DAYS_BEFORE_GATHERING = 2;

export interface SeededHistoricalCycle {
  id: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
}

export interface LoadDevelopmentHistoryInput {
  db: SeedWriter;
  churchId: string;
  timeZone: string;
  anchor: CalendarDay;
  directory: ChurchDirectoryBlueprint;
  gatherings: GatheringsBlueprint;
  seededGatherings: SeededGatherings;
  history: HistoryBlueprint;
  ministries: Map<string, SeededMinistryStructure>;
  volunteerIdByEmail: Map<string, string>;
  userIdByEmail: Map<string, string>;
}

interface PlannedRequirement {
  id: string;
  roleName: string;
  teamName?: string;
  roleId: string;
  required: number;
}

interface PlannedShift {
  id: string;
  participationId: string;
  ministryId: string;
  ministryName: string;
  eventId: string;
  eventTitle: string;
  /** `${block}#${week}` for a regular gathering, the title for a dynamic one. */
  gatheringKey: string;
  day: CalendarDay;
  start: Instant;
  end: Instant;
  requirements: PlannedRequirement[];
}

interface PlannedServer {
  ministryName: string;
  needs: readonly StaffingNeed[];
}

interface PlannedSlot {
  key: string;
  /** How the history blueprint names this slot's gathering. */
  gatheringKey: string;
  blockId?: string;
  label: string;
  start: Instant;
  end: Instant;
  servers: PlannedServer[];
}

interface PlannedEvent {
  key: string;
  title: string;
  day: CalendarDay;
  start: Instant;
  /** Which matching weekday of the month this day is, 1-based. */
  week: number;
  sourceTemplateId?: string;
  slots: PlannedSlot[];
}

interface GatheringKeyInput {
  block: GatheringBlockKey;
  week: number;
}

function gatheringKeyOf({ block, week }: GatheringKeyInput): string {
  return `${block}#${week}`;
}

interface DayTimeInput {
  day: CalendarDay;
  time: string;
  timeZone: string;
}

function instantAt({ day, time, timeZone }: DayTimeInput): Instant {
  return toInstant({ day, time: parseTimeOfDay({ value: time }), timeZone });
}

interface PlanEventsInput {
  window: SeededHistoricalCycle;
  timeZone: string;
  gatherings: GatheringsBlueprint;
  seededGatherings: SeededGatherings;
}

/** Every Event the cycle holds, in the order a calendar shows them. */
function planEvents({
  window,
  timeZone,
  gatherings,
  seededGatherings,
}: PlanEventsInput): PlannedEvent[] {
  const days = enumerateCalendarDays({
    start: window.startDate,
    end: addCalendarDays({ day: window.endDate, days: -1 }),
  });
  const seenByWeekday = new Map<number, number>();
  const events: PlannedEvent[] = [];

  for (const day of days) {
    const weekday = weekdayIndex({ day });
    const week = (seenByWeekday.get(weekday) ?? 0) + 1;
    seenByWeekday.set(weekday, week);

    for (const template of gatherings.templates) {
      if (template.weekday !== weekday) continue;
      const slots = template.blocks.map((block) => {
        const seededBlock = seededGatherings.blocks.find(
          (candidate) => candidate.key === block.key,
        );
        if (!seededBlock) {
          throw new Error(`TimeBlock ${block.key} was not seeded.`);
        }
        return {
          key: block.key,
          gatheringKey: gatheringKeyOf({ block: block.key, week }),
          blockId: seededBlock.id,
          label: block.label,
          start: instantAt({ day, time: block.startTime, timeZone }),
          end: instantAt({ day, time: block.endTime, timeZone }),
          servers: gatherings.servingRules.flatMap((rule) => {
            const needs = rule.blocks[block.key];
            return needs === null
              ? []
              : [{ ministryName: rule.ministry.name, needs }];
          }),
        };
      });
      const [firstSlot] = slots;
      if (!firstSlot) continue;
      events.push({
        key: template.name,
        title: template.name,
        day,
        start: firstSlot.start,
        week,
        sourceTemplateId: seededGatherings.blocks.find(
          (block) => block.templateName === template.name,
        )?.templateId,
        slots,
      });
    }

    for (const dynamicEvent of gatherings.dynamicEvents) {
      if (dynamicEvent.weekday !== weekday) continue;
      if (dynamicEvent.occurrence !== week) continue;
      const start = instantAt({
        day,
        time: dynamicEvent.startTime,
        timeZone,
      });
      events.push({
        key: dynamicEvent.title,
        title: dynamicEvent.title,
        day,
        start,
        week,
        slots: [
          {
            key: dynamicEvent.title,
            gatheringKey: dynamicEvent.title,
            label: dynamicEvent.label,
            start,
            end: instantAt({ day, time: dynamicEvent.endTime, timeZone }),
            servers: dynamicEvent.participations.map((participation) => ({
              ministryName: participation.ministry.name,
              needs: participation.needs,
            })),
          },
        ],
      });
    }
  }

  return events.sort((left, right) =>
    compareInstants({ left: left.start, right: right.start }),
  );
}

interface MaterializeEventInput {
  db: SeedWriter;
  churchId: string;
  cycleId: string;
  plannedEvent: PlannedEvent;
  ministries: Map<string, SeededMinistryStructure>;
  ministryOrder: readonly string[];
}

/**
 * One Event as the cycle's generation and its leaders left it: a TimeSlot
 * per block, one published MinistryParticipation per serving Ministry with a
 * whole-slot Shift for each slot it serves, and that Shift's requirements.
 */
async function materializeEvent({
  db,
  churchId,
  cycleId,
  plannedEvent,
  ministries,
  ministryOrder,
}: MaterializeEventInput): Promise<PlannedShift[]> {
  const [firstSlot] = plannedEvent.slots;
  const lastSlot = plannedEvent.slots.at(-1);
  if (!firstSlot || !lastSlot) return [];

  const eventId = deriveSeedId({
    kind: 'event',
    parentIds: [cycleId, plannedEvent.key, plannedEvent.day],
  });
  await buildEvent({
    db,
    churchId,
    planningCycleId: cycleId,
    id: eventId,
    title: plannedEvent.title,
    start: firstSlot.start,
    end: lastSlot.end,
    status: 'past',
    eventType: 'hourly',
    sourceTemplateId: plannedEvent.sourceTemplateId,
  });

  const slotIdByKey = new Map<string, string>();
  for (const slot of plannedEvent.slots) {
    const timeSlotId = deriveSeedId({
      kind: 'time-slot',
      parentIds: [eventId, slot.key],
    });
    await buildTimeSlot({
      db,
      churchId,
      eventId,
      id: timeSlotId,
      start: slot.start,
      end: slot.end,
      label: slot.label,
      sourceTemplateBlockId: slot.blockId,
    });
    slotIdByKey.set(slot.key, timeSlotId);
  }

  const shifts: PlannedShift[] = [];
  for (const ministryName of ministryOrder) {
    const servedSlots = plannedEvent.slots.flatMap((slot) => {
      const server = slot.servers.find(
        (candidate) => candidate.ministryName === ministryName,
      );
      const timeSlotId = slotIdByKey.get(slot.key);
      return server && timeSlotId ? [{ slot, server, timeSlotId }] : [];
    });
    if (servedSlots.length === 0) continue;

    const ministry = requireMinistry({ ministries, name: ministryName });
    const participationId = deriveSeedId({
      kind: 'ministry-participation',
      parentIds: [eventId, ministry.ministryId],
    });
    await buildMinistryParticipation({
      db,
      churchId,
      ministryId: ministry.ministryId,
      eventId,
      id: participationId,
      state: 'published',
      timeSlotIds: servedSlots.map(({ timeSlotId }) => timeSlotId),
    });

    for (const { slot, server, timeSlotId } of servedSlots) {
      const shiftId = deriveSeedId({
        kind: 'shift',
        parentIds: [participationId, timeSlotId],
      });
      await buildShift({
        db,
        churchId,
        participationId,
        timeSlotId,
        id: shiftId,
        start: slot.start,
        end: slot.end,
      });

      const requirements: PlannedRequirement[] = [];
      for (const need of server.needs) {
        const { roleId, teamId } = resolveStaffingNeed({
          ministry,
          ministryName,
          need,
        });
        const requirementId = deriveSeedId({
          kind: 'slot-requirement',
          parentIds: [shiftId, roleId, teamId ?? ''],
        });
        await buildSlotRequirement({
          db,
          churchId,
          participationId,
          shiftId,
          roleId,
          teamId,
          id: requirementId,
          requiredCount: need.count,
          notes: need.notes,
        });
        requirements.push({
          id: requirementId,
          roleName: need.role,
          teamName: need.team,
          roleId,
          required: need.count,
        });
      }

      shifts.push({
        id: shiftId,
        participationId,
        ministryId: ministry.ministryId,
        ministryName,
        eventId,
        eventTitle: plannedEvent.title,
        gatheringKey: slot.gatheringKey,
        day: plannedEvent.day,
        start: slot.start,
        end: slot.end,
        requirements,
      });
    }
  }

  return shifts;
}

/** A person's place in one Ministry, as the roster blueprint seats them. */
interface PoolMember {
  email: string;
  roles: ReadonlySet<string>;
  teams: ReadonlySet<string>;
}

interface MinistryPoolsInput {
  directory: ChurchDirectoryBlueprint;
  ministry: MinistryBlueprint;
}

/** Everyone seated in the Ministry, its own roster before cross-Ministry seats. */
function ministryMembers({
  directory,
  ministry,
}: MinistryPoolsInput): PoolMember[] {
  const members: PoolMember[] = [];
  for (const group of ministry.roster) {
    for (const person of group.people) {
      members.push({
        email: person.email,
        roles: new Set(group.seat.roles),
        teams: new Set((group.seat.teams ?? []).map((seat) => seat.team)),
      });
    }
  }
  for (const group of directory.crossMinistry) {
    if (group.ministry.name !== ministry.name) continue;
    for (const email of group.emails) {
      members.push({
        email,
        roles: new Set(group.seat.roles),
        teams: new Set((group.seat.teams ?? []).map((seat) => seat.team)),
      });
    }
  }
  return members;
}

interface TimeRange {
  start: Instant;
  end: Instant;
}

interface OverlapsInput {
  left: TimeRange;
  right: TimeRange;
}

function overlaps({ left, right }: OverlapsInput): boolean {
  return (
    compareInstants({ left: left.start, right: right.end }) < 0 &&
    compareInstants({ left: right.start, right: left.end }) < 0
  );
}

interface PlacementTarget {
  shift: PlannedShift;
  requirement: PlannedRequirement;
}

/**
 * What became of an Assignment: still serving, declined by its Volunteer, or
 * reassigned away (the product deletes that row, so it is never written).
 */
type AssignmentOutcome =
  | Extract<AssignmentStatus, 'confirmed' | 'declined'>
  | 'reassigned';

interface AssignmentWrite {
  target: PlacementTarget;
  email: string;
  outcome: AssignmentOutcome;
  assignedAt: Instant;
  /** The leader who made it; every Assignment here is its Ministry leader's. */
  assignedByEmail: string;
  /** The row's reason: a decline's, or the override a reassignment carried. */
  reason?: string;
  /** The override reason createAssignment also writes on its `created` audit. */
  createdReason?: string;
}

interface PlaceInput {
  target: PlacementTarget;
  email: string;
  assignedAt: Instant;
  createdReason?: string;
}

interface WithdrawInput {
  target: PlacementTarget;
  email: string;
  outcome: Exclude<AssignmentOutcome, 'confirmed'>;
  assignedAt: Instant;
  reason?: string;
}

interface StaffingLedgerInput {
  directory: ChurchDirectoryBlueprint;
  ministryBlueprints: ReadonlyMap<string, MinistryBlueprint>;
}

/**
 * Who serves where: refuses any placement the product would flag, so the
 * history never holds an unqualified, double-booked, unavailable, declined or
 * over-filled Assignment.
 */
class StaffingLedger {
  private readonly busy = new Map<string, TimeRange[]>();
  private readonly unavailable = new Map<string, TimeRange[]>();
  private readonly excludedByShift = new Map<string, Set<string>>();
  private readonly filled = new Map<string, number>();
  private readonly membersByMinistry = new Map<string, PoolMember[]>();
  private readonly leaderEmailByMinistry = new Map<string, string>();
  readonly writes: AssignmentWrite[] = [];

  constructor({ directory, ministryBlueprints }: StaffingLedgerInput) {
    for (const [name, ministry] of ministryBlueprints) {
      this.membersByMinistry.set(
        name,
        ministryMembers({ directory, ministry }),
      );
      this.leaderEmailByMinistry.set(name, leaderEmailOf({ ministry }));
    }
  }

  /** Who rosters the shift's Ministry. */
  leaderOf({ shift }: ShiftMomentInput): string {
    const leaderEmail = this.leaderEmailByMinistry.get(shift.ministryName);
    if (!leaderEmail) {
      throw new Error(`${shift.ministryName} has no Ministry leader.`);
    }
    return leaderEmail;
  }

  pool({ shift, requirement }: PlacementTarget): PoolMember[] {
    return (this.membersByMinistry.get(shift.ministryName) ?? []).filter(
      (member) =>
        member.roles.has(requirement.roleName) &&
        (requirement.teamName === undefined ||
          member.teams.has(requirement.teamName)),
    );
  }

  filledCount({ requirement }: PlacementTarget): number {
    return this.filled.get(requirement.id) ?? 0;
  }

  markUnavailable({ email, range }: MarkUnavailableInput): void {
    this.unavailable.set(email, [
      ...(this.unavailable.get(email) ?? []),
      range,
    ]);
  }

  exclude({ email, shift }: ExcludeInput): void {
    const excluded = this.excludedByShift.get(shift.id) ?? new Set<string>();
    excluded.add(email);
    this.excludedByShift.set(shift.id, excluded);
  }

  /** Why `email` cannot take the target, or `undefined` when they can. */
  refusal({ target, email }: RefusalInput): string | undefined {
    const { shift, requirement } = target;
    if (!this.pool(target).some((member) => member.email === email)) {
      return `is not qualified as ${requirement.roleName}${requirement.teamName ? ` in ${requirement.teamName}` : ''}`;
    }
    if (this.excludedByShift.get(shift.id)?.has(email)) {
      return 'already declined or was withdrawn';
    }
    const range = { start: shift.start, end: shift.end };
    if (
      (this.busy.get(email) ?? []).some((other) =>
        overlaps({ left: other, right: range }),
      )
    ) {
      return 'is already serving then';
    }
    if (
      (this.unavailable.get(email) ?? []).some((other) =>
        overlaps({ left: other, right: range }),
      )
    ) {
      return 'marked themselves unavailable';
    }
    if (this.filledCount(target) >= requirement.required) {
      return 'would over-fill the requirement';
    }
    return undefined;
  }

  /** An active Assignment; a blueprint placement the product would flag fails the load. */
  place({
    target,
    email,
    assignedAt,
    createdReason,
  }: PlaceInput): AssignmentWrite {
    const refused = this.refusal({ target, email });
    if (refused) {
      throw new Error(
        `History blueprint places ${email} at ${target.shift.ministryName} ${target.shift.gatheringKey}, but they ${refused}.`,
      );
    }
    this.busy.set(email, [
      ...(this.busy.get(email) ?? []),
      { start: target.shift.start, end: target.shift.end },
    ]);
    this.filled.set(target.requirement.id, this.filledCount(target) + 1);
    const write: AssignmentWrite = {
      target,
      email,
      outcome: 'confirmed',
      assignedAt,
      assignedByEmail: this.leaderOf({ shift: target.shift }),
      reason: createdReason,
      createdReason,
    };
    this.writes.push(write);
    return write;
  }

  /** An Assignment its Volunteer declined or its leader reassigned away. */
  withdraw({
    target,
    email,
    outcome,
    assignedAt,
    reason,
  }: WithdrawInput): AssignmentWrite {
    this.exclude({ email, shift: target.shift });
    const write: AssignmentWrite = {
      target,
      email,
      outcome,
      assignedAt,
      assignedByEmail: this.leaderOf({ shift: target.shift }),
      reason,
    };
    this.writes.push(write);
    return write;
  }
}

interface MarkUnavailableInput {
  email: string;
  range: TimeRange;
}

interface ExcludeInput {
  email: string;
  shift: PlannedShift;
}

interface RefusalInput {
  target: PlacementTarget;
  email: string;
}

interface FindTargetInput {
  shifts: readonly PlannedShift[];
  post: ServicePost;
}

function findTarget({ shifts, post }: FindTargetInput): PlacementTarget {
  const shift = findShift({
    shifts,
    ministryName: post.ministry.name,
    gathering: post.gathering,
  });
  const requirement = shift.requirements.find(
    (candidate) =>
      candidate.roleName === post.role && candidate.teamName === post.team,
  );
  if (!requirement) {
    throw new Error(
      `History blueprint names a ${post.role} post ${post.ministry.name} does not staff at ${shift.gatheringKey}.`,
    );
  }
  return { shift, requirement };
}

interface FindShiftInput {
  shifts: readonly PlannedShift[];
  ministryName: string;
  gathering: GatheringRef;
}

function findShift({
  shifts,
  ministryName,
  gathering,
}: FindShiftInput): PlannedShift {
  const gatheringKey = gatheringKeyOf(gathering);
  const shift = shifts.find(
    (candidate) =>
      candidate.ministryName === ministryName &&
      candidate.gatheringKey === gatheringKey,
  );
  if (!shift) {
    throw new Error(
      `History blueprint names ${gatheringKey}, which ${ministryName} does not serve.`,
    );
  }
  return shift;
}

interface CycleNameInput {
  startDate: CalendarDay;
}

function cycleNameOf({ startDate }: CycleNameInput): string {
  const month = MONTH_NAMES[Number(startDate.slice(5, 7)) - 1];
  return `${month} ${startDate.slice(0, 4)}`;
}

interface LeaderOfInput {
  ministry: MinistryBlueprint;
}

function leaderEmailOf({ ministry }: LeaderOfInput): string {
  const leader = ministry.roster.find((group) => group.seat.ministryLeader)
    ?.people[0];
  if (!leader) {
    throw new Error(`${ministry.name} has no Ministry leader to roster it.`);
  }
  return leader.email;
}

interface AuditPlan {
  assignment: AssignmentWrite;
  actorEmail: string;
  action: 'updated';
  reason?: string;
  occurredAt: Instant;
}

interface RequireKnownInput {
  ids: Map<string, string>;
  key: string;
}

function requireKnown({ ids, key }: RequireKnownInput): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`History blueprint names unknown person ${key}.`);
  }
  return id;
}

interface FireAvailabilityRoundInput {
  db: SeedWriter;
  churchId: string;
  cycle: SeededHistoricalCycle;
  directory: ChurchDirectoryBlueprint;
  history: HistoryBlueprint;
  ministries: Map<string, SeededMinistryStructure>;
  volunteerIdByEmail: Map<string, string>;
  shifts: readonly PlannedShift[];
  ledger: StaffingLedger;
  confirmedAt: Instant;
}

/**
 * Availability was fired for every Ministry Membership and every check
 * answered; only the blueprint's people left unavailability marks.
 */
async function fireAvailabilityRound({
  db,
  churchId,
  cycle,
  directory,
  history,
  ministries,
  volunteerIdByEmail,
  shifts,
  ledger,
  confirmedAt,
}: FireAvailabilityRoundInput): Promise<void> {
  const checkIdByMembership = new Map<string, string>();
  for (const ministryBlueprint of directory.ministries) {
    const ministry = requireMinistry({
      ministries,
      name: ministryBlueprint.name,
    });
    for (const member of ministryMembers({
      directory,
      ministry: ministryBlueprint,
    })) {
      const volunteerId = requireKnown({
        ids: volunteerIdByEmail,
        key: member.email,
      });
      const membershipId = deriveSeedId({
        kind: 'ministry-membership',
        parentIds: [ministry.ministryId, volunteerId],
      });
      const checkId = deriveSeedId({
        kind: 'availability-check',
        parentIds: [cycle.id, membershipId],
      });
      await buildConfirmedAvailabilityCheck({
        db,
        churchId,
        planningCycleId: cycle.id,
        ministryVolunteerId: membershipId,
        id: checkId,
        confirmedAt,
      });
      checkIdByMembership.set(
        `${ministryBlueprint.name}|${member.email}`,
        checkId,
      );
    }
  }

  for (const incident of history.unavailability) {
    const checkId = requireKnown({
      ids: checkIdByMembership,
      key: `${incident.ministry.name}|${incident.email}`,
    });
    for (const gathering of incident.gatherings) {
      const shift = findShift({
        shifts,
        ministryName: incident.ministry.name,
        gathering,
      });
      await buildUnavailabilityMark({
        db,
        churchId,
        availabilityCheckId: checkId,
        shiftId: shift.id,
        id: deriveSeedId({
          kind: 'availability',
          parentIds: [checkId, shift.id],
        }),
      });
      ledger.markUnavailable({
        email: incident.email,
        range: { start: shift.start, end: shift.end },
      });
    }
  }
}

type ShiftMoment = (input: ShiftMomentInput) => Instant;

interface ApplyHistoryTrailInput {
  ledger: StaffingLedger;
  shifts: readonly PlannedShift[];
  history: HistoryBlueprint;
  rosteredAt: Instant;
  replacedAt: ShiftMoment;
}

/** The audits and notifications a trail step wrote beyond the routine ones. */
interface TrailRecords {
  audits: AuditPlan[];
  notifications: NotificationPlan[];
}

/**
 * The blueprint's trail placed before rotation: cross-Ministry service, the
 * overlap a leader resolved by reassignment, and the decline with its
 * replacement, each as the product records it.
 */
function applyHistoryTrail({
  ledger,
  shifts,
  history,
  rosteredAt,
  replacedAt,
}: ApplyHistoryTrailInput): TrailRecords {
  const records: TrailRecords = { audits: [], notifications: [] };
  for (const incident of history.crossMinistryService) {
    for (const servicePost of incident.posts) {
      ledger.place({
        target: findTarget({ shifts, post: servicePost }),
        email: incident.email,
        assignedAt: rosteredAt,
      });
    }
  }

  // reassignParticipationAssignment: a new Assignment carrying the override
  // reason (`created` and `updated` audits), the old row deleted, and both
  // Volunteers notified about the new Assignment.
  for (const incident of history.resolvedOverlaps) {
    ledger.place({
      target: findTarget({ shifts, post: incident.kept }),
      email: incident.email,
      assignedAt: rosteredAt,
    });
    const target = findTarget({ shifts, post: incident.withdrawn });
    ledger.withdraw({
      target,
      email: incident.email,
      outcome: 'reassigned',
      assignedAt: rosteredAt,
    });
    const reassignedAt = replacedAt({ shift: target.shift });
    const replacement = ledger.place({
      target,
      email: incident.replacementEmail,
      assignedAt: reassignedAt,
      createdReason: incident.reason,
    });
    records.audits.push({
      assignment: replacement,
      actorEmail: replacement.assignedByEmail,
      action: 'updated',
      reason: incident.reason,
      occurredAt: reassignedAt,
    });
    const { eventTitle } = target.shift;
    records.notifications.push(
      {
        email: incident.email,
        shift: target.shift,
        assignment: replacement,
        type: 'assignment_removed',
        title: 'Assignment changed',
        body: `${eventTitle} has been reassigned.`,
        createdAt: reassignedAt,
      },
      {
        email: incident.replacementEmail,
        shift: target.shift,
        assignment: replacement,
        type: 'assignment_added',
        title: 'New assignment',
        body: `You were assigned to ${eventTitle}.`,
        createdAt: reassignedAt,
      },
    );
  }

  // respondToAssignment only sets the status and reason; the leader then
  // assigns a replacement like any other Assignment.
  for (const incident of history.declines) {
    const target = findTarget({ shifts, post: incident.post });
    ledger.withdraw({
      target,
      email: incident.email,
      outcome: 'declined',
      assignedAt: rosteredAt,
      reason: incident.reason,
    });
    ledger.place({
      target,
      email: incident.replacementEmail,
      assignedAt: replacedAt({ shift: target.shift }),
    });
  }

  return records;
}

interface StaffByRotationInput {
  ledger: StaffingLedger;
  shifts: readonly PlannedShift[];
  history: HistoryBlueprint;
  assignedAt: Instant;
}

/**
 * Everyone the trail did not place, by rotation: each post's qualified
 * people take turns, skipping whoever the ledger refuses, and leaving open
 * only the declared shortfalls.
 */
function staffByRotation({
  ledger,
  shifts,
  history,
  assignedAt,
}: StaffByRotationInput): void {
  const missingByRequirement = new Map<string, number>();
  for (const shortfall of history.shortfalls) {
    const { requirement } = findTarget({ shifts, post: shortfall.post });
    missingByRequirement.set(requirement.id, shortfall.missing);
  }

  const cursorByPool = new Map<string, number>();
  const chronological = [...shifts].sort((left, right) =>
    compareInstants({ left: left.start, right: right.start }),
  );
  for (const shift of chronological) {
    for (const requirement of shift.requirements) {
      const target = { shift, requirement };
      const pool = ledger.pool(target);
      const poolKey = `${shift.ministryName}|${requirement.roleName}|${requirement.teamName ?? ''}`;
      let cursor = cursorByPool.get(poolKey) ?? 0;
      let open =
        requirement.required -
        (missingByRequirement.get(requirement.id) ?? 0) -
        ledger.filledCount(target);
      for (let tried = 0; open > 0 && tried < pool.length; tried += 1) {
        const member = pool[cursor % pool.length];
        cursor += 1;
        if (!member || ledger.refusal({ target, email: member.email })) {
          continue;
        }
        ledger.place({ target, email: member.email, assignedAt });
        open -= 1;
      }
      if (open > 0) {
        throw new Error(
          `Not enough qualified people to staff ${shift.ministryName} ${requirement.roleName} at ${shift.gatheringKey}.`,
        );
      }
      cursorByPool.set(poolKey, cursor);
    }
  }
}

/**
 * The previous complete calendar month as a locked historical PlanningCycle:
 * every gathering materialized, every Ministry's slice published, mostly
 * fully staffed by rotation, plus the blueprint's trail of unavailability,
 * declines, replacements and cross-Ministry service. Nothing reaches the
 * anchor's month, so current and future planning stays empty.
 */
export async function loadDevelopmentHistory({
  db,
  churchId,
  timeZone,
  anchor,
  directory,
  gatherings,
  seededGatherings,
  history,
  ministries,
  volunteerIdByEmail,
  userIdByEmail,
}: LoadDevelopmentHistoryInput): Promise<SeededHistoricalCycle> {
  const window = historicalCycleWindow({ anchor });
  const cycle: SeededHistoricalCycle = {
    id: deriveSeedId({
      kind: 'planning-cycle',
      parentIds: [churchId, window.startDate],
    }),
    ...window,
  };
  await buildPlanningCycle({
    db,
    churchId,
    id: cycle.id,
    name: cycleNameOf({ startDate: cycle.startDate }),
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    state: 'locked',
  });

  const ministryOrder = [
    ...new Set([
      ...gatherings.servingRules.map((rule) => rule.ministry.name),
      ...gatherings.dynamicEvents.flatMap((dynamicEvent) =>
        dynamicEvent.participations.map(
          (participation) => participation.ministry.name,
        ),
      ),
    ]),
  ];
  const shifts: PlannedShift[] = [];
  for (const plannedEvent of planEvents({
    window: cycle,
    timeZone,
    gatherings,
    seededGatherings,
  })) {
    shifts.push(
      ...(await materializeEvent({
        db,
        churchId,
        cycleId: cycle.id,
        plannedEvent,
        ministries,
        ministryOrder,
      })),
    );
  }

  const at = ({ day, time }: DayTimeAtInput): Instant =>
    instantAt({ day, time, timeZone });
  const rosteredAt = at({
    day: addCalendarDays({ day: cycle.startDate, days: -ROSTERED_DAYS_BEFORE }),
    time: '10:00',
  });
  const publishedAt = at({
    day: addCalendarDays({
      day: cycle.startDate,
      days: -PUBLISHED_DAYS_BEFORE,
    }),
    time: '18:00',
  });
  /** People open a notification the morning after it arrives. */
  const readAfter = ({ instant }: InstantInput): Instant =>
    at({
      day: addCalendarDays({ day: today({ instant, timeZone }), days: 1 }),
      time: '08:00',
    });
  const replacedAt = ({ shift }: ShiftMomentInput): Instant =>
    at({
      day: addCalendarDays({
        day: shift.day,
        days: -REPLACED_DAYS_BEFORE_GATHERING,
      }),
      time: '10:00',
    });

  const ministryBlueprints = new Map(
    directory.ministries.map((ministry) => [ministry.name, ministry]),
  );
  const ledger = new StaffingLedger({ directory, ministryBlueprints });

  await fireAvailabilityRound({
    db,
    churchId,
    cycle,
    directory,
    history,
    ministries,
    volunteerIdByEmail,
    shifts,
    ledger,
    confirmedAt: at({
      day: addCalendarDays({
        day: cycle.startDate,
        days: -AVAILABILITY_CONFIRMED_DAYS_BEFORE,
      }),
      time: '20:00',
    }),
  });

  const trail = applyHistoryTrail({
    ledger,
    shifts,
    history,
    rosteredAt,
    replacedAt,
  });
  staffByRotation({ ledger, shifts, history, assignedAt: rosteredAt });

  const assignmentIdOf = ({ target, email }: AssignmentWrite): string =>
    deriveSeedId({
      kind: 'assignment',
      parentIds: [
        target.shift.id,
        requireKnown({ ids: volunteerIdByEmail, key: email }),
      ],
    });
  const userIdOf = ({ email }: EmailInput): string =>
    requireKnown({ ids: userIdByEmail, key: email });

  // createAssignment: every Assignment with its `created` audit by the
  // leader who made it. A reassigned-away row was deleted, audit and all.
  for (const write of ledger.writes) {
    if (write.outcome === 'reassigned') continue;
    const assignmentId = assignmentIdOf(write);
    await buildAssignment({
      db,
      churchId,
      participationId: write.target.shift.participationId,
      shiftId: write.target.shift.id,
      volunteerId: requireKnown({ ids: volunteerIdByEmail, key: write.email }),
      roleId: write.target.requirement.roleId,
      id: assignmentId,
      status: write.outcome,
      reason: write.reason,
      assignedAt: write.assignedAt,
      assignedBy: userIdOf({ email: write.assignedByEmail }),
    });
    await buildAssignmentAudit({
      db,
      churchId,
      assignmentId,
      actorId: userIdOf({ email: write.assignedByEmail }),
      id: deriveSeedId({
        kind: 'assignment-audit',
        parentIds: [assignmentId, 'created'],
      }),
      action: 'created',
      reason: write.createdReason,
      occurredAt: write.assignedAt,
    });
  }
  for (const audit of trail.audits) {
    const assignmentId = assignmentIdOf(audit.assignment);
    await buildAssignmentAudit({
      db,
      churchId,
      assignmentId,
      actorId: userIdOf({ email: audit.actorEmail }),
      id: deriveSeedId({
        kind: 'assignment-audit',
        parentIds: [assignmentId, audit.action],
      }),
      action: audit.action,
      reason: audit.reason,
      occurredAt: audit.occurredAt,
    });
  }

  // Publishing notified each Volunteer rostered on a participation at that
  // moment, once per participation; later replacements were not notified.
  const recipientsByParticipation = new Map<string, PublishRecipients>();
  for (const write of ledger.writes) {
    if (compareInstants({ left: write.assignedAt, right: publishedAt }) > 0) {
      continue;
    }
    const { shift } = write.target;
    const recipients = recipientsByParticipation.get(shift.participationId) ?? {
      shift,
      emails: new Set<string>(),
    };
    recipients.emails.add(write.email);
    recipientsByParticipation.set(shift.participationId, recipients);
  }
  const notifications: NotificationPlan[] = [
    ...[...recipientsByParticipation.values()].flatMap(({ shift, emails }) =>
      [...emails].map(
        (email): NotificationPlan => ({
          email,
          shift,
          type: 'schedule_published',
          title: 'Schedule published',
          body: `${shift.eventTitle} is now published for your ministry.`,
          createdAt: publishedAt,
        }),
      ),
    ),
    ...trail.notifications,
  ];
  const unread = new Set(history.unreadNotificationEmails);
  for (const notification of notifications) {
    const volunteerId = requireKnown({
      ids: volunteerIdByEmail,
      key: notification.email,
    });
    const { shift } = notification;
    const assignmentId = notification.assignment
      ? assignmentIdOf(notification.assignment)
      : undefined;
    await buildVolunteerNotification({
      db,
      churchId,
      volunteerId,
      id: deriveSeedId({
        kind: 'volunteer-notification',
        parentIds: [
          notification.type,
          assignmentId ?? shift.participationId,
          volunteerId,
        ],
      }),
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: assignmentId
        ? { assignmentId, eventId: shift.eventId, ministryId: shift.ministryId }
        : {
            eventId: shift.eventId,
            ministryId: shift.ministryId,
            section: 'assignments',
          },
      createdAt: notification.createdAt,
      readAt: unread.has(notification.email)
        ? undefined
        : readAfter({ instant: notification.createdAt }),
      planningCycleId: cycle.id,
      ministryId: shift.ministryId,
      eventId: shift.eventId,
      assignmentId,
    });
  }

  return cycle;
}

interface InstantInput {
  instant: Instant;
}

interface EmailInput {
  email: string;
}

interface PublishRecipients {
  shift: PlannedShift;
  emails: Set<string>;
}

/** A notification as the product's notifyVolunteer call would write it. */
interface NotificationPlan {
  email: string;
  shift: PlannedShift;
  /** The Assignment it is about; absent for a publish notification. */
  assignment?: AssignmentWrite;
  type: Extract<
    VolunteerNotificationType,
    'schedule_published' | 'assignment_added' | 'assignment_removed'
  >;
  title: string;
  body: string;
  createdAt: Instant;
}

interface DayTimeAtInput {
  day: CalendarDay;
  time: string;
}

interface ShiftMomentInput {
  shift: PlannedShift;
}
