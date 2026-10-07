import {
  addCalendarDays,
  type CalendarDay,
  compareInstants,
  enumerateCalendarDays,
  type Instant,
  parseTimeOfDay,
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
/** When a decline or withdrawal happened, and its replacement was made. */
const WITHDRAWN_DAYS_BEFORE_GATHERING = 3;
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
  ministryName: string;
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
        ministryName,
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

interface AssignmentWrite {
  target: PlacementTarget;
  email: string;
  status: AssignmentStatus;
  assignedAt: Instant;
  reason?: string;
}

interface PlaceInput {
  target: PlacementTarget;
  email: string;
  assignedAt: Instant;
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
  readonly writes: AssignmentWrite[] = [];

  constructor({ directory, ministryBlueprints }: StaffingLedgerInput) {
    for (const [name, ministry] of ministryBlueprints) {
      this.membersByMinistry.set(
        name,
        ministryMembers({ directory, ministry }),
      );
    }
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
  place({ target, email, assignedAt }: PlaceInput): AssignmentWrite {
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
      status: 'confirmed',
      assignedAt,
    };
    this.writes.push(write);
    return write;
  }

  /** A declined or cancelled Assignment: the person no longer serves the Shift. */
  withdraw({
    target,
    email,
    status,
    assignedAt,
    reason,
  }: AssignmentWrite): void {
    this.exclude({ email, shift: target.shift });
    this.writes.push({ target, email, status, assignedAt, reason });
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
  action: 'created' | 'status_change';
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
  const withdrawnAt = ({ shift }: ShiftMomentInput): Instant =>
    at({
      day: addCalendarDays({
        day: shift.day,
        days: -WITHDRAWN_DAYS_BEFORE_GATHERING,
      }),
      time: '09:00',
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

  // Availability was fired for every Ministry Membership, and every check
  // answered; only the blueprint's people left marks.
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
        confirmedAt: at({
          day: addCalendarDays({
            day: cycle.startDate,
            days: -AVAILABILITY_CONFIRMED_DAYS_BEFORE,
          }),
          time: '20:00',
        }),
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

  const audits: AuditPlan[] = [];
  for (const incident of history.crossMinistryService) {
    for (const servicePost of incident.posts) {
      ledger.place({
        target: findTarget({ shifts, post: servicePost }),
        email: incident.email,
        assignedAt: rosteredAt,
      });
    }
  }

  for (const incident of history.resolvedOverlaps) {
    ledger.place({
      target: findTarget({ shifts, post: incident.kept }),
      email: incident.email,
      assignedAt: rosteredAt,
    });
    const target = findTarget({ shifts, post: incident.withdrawn });
    const withdrawn: AssignmentWrite = {
      target,
      email: incident.email,
      status: 'cancelled',
      assignedAt: rosteredAt,
      reason: incident.reason,
    };
    ledger.withdraw(withdrawn);
    const replacement = ledger.place({
      target,
      email: incident.replacementEmail,
      assignedAt: replacedAt({ shift: target.shift }),
    });
    const leaderEmail = leaderEmailOf({
      ministry: incident.withdrawn.ministry,
    });
    audits.push(
      {
        assignment: withdrawn,
        actorEmail: leaderEmail,
        action: 'status_change',
        reason: incident.reason,
        occurredAt: withdrawnAt({ shift: target.shift }),
      },
      {
        assignment: replacement,
        actorEmail: leaderEmail,
        action: 'created',
        occurredAt: replacedAt({ shift: target.shift }),
      },
    );
  }

  for (const incident of history.declines) {
    const target = findTarget({ shifts, post: incident.post });
    const declined: AssignmentWrite = {
      target,
      email: incident.email,
      status: 'declined',
      assignedAt: rosteredAt,
      reason: incident.reason,
    };
    ledger.withdraw(declined);
    const replacement = ledger.place({
      target,
      email: incident.replacementEmail,
      assignedAt: replacedAt({ shift: target.shift }),
    });
    audits.push(
      {
        assignment: declined,
        actorEmail: incident.email,
        action: 'status_change',
        reason: incident.reason,
        occurredAt: withdrawnAt({ shift: target.shift }),
      },
      {
        assignment: replacement,
        actorEmail: leaderEmailOf({ ministry: incident.post.ministry }),
        action: 'created',
        occurredAt: replacedAt({ shift: target.shift }),
      },
    );
  }

  const missingByRequirement = new Map<string, number>();
  for (const shortfall of history.shortfalls) {
    const { requirement } = findTarget({ shifts, post: shortfall.post });
    missingByRequirement.set(requirement.id, shortfall.missing);
  }

  // Everyone else by rotation: each post's qualified people take turns.
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
        ledger.place({ target, email: member.email, assignedAt: rosteredAt });
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

  const assignmentIdOf = ({ target, email }: AssignmentWrite): string =>
    deriveSeedId({
      kind: 'assignment',
      parentIds: [
        target.shift.id,
        requireKnown({ ids: volunteerIdByEmail, key: email }),
      ],
    });
  for (const write of ledger.writes) {
    const ministryBlueprint = ministryBlueprints.get(
      write.target.shift.ministryName,
    );
    await buildAssignment({
      db,
      churchId,
      participationId: write.target.shift.participationId,
      shiftId: write.target.shift.id,
      volunteerId: requireKnown({ ids: volunteerIdByEmail, key: write.email }),
      roleId: write.target.requirement.roleId,
      id: assignmentIdOf(write),
      status: write.status,
      reason: write.reason,
      assignedAt: write.assignedAt,
      assignedBy: ministryBlueprint
        ? requireKnown({
            ids: userIdByEmail,
            key: leaderEmailOf({ ministry: ministryBlueprint }),
          })
        : undefined,
    });
  }
  for (const audit of audits) {
    const assignmentId = assignmentIdOf(audit.assignment);
    await buildAssignmentAudit({
      db,
      churchId,
      assignmentId,
      actorId: requireKnown({ ids: userIdByEmail, key: audit.actorEmail }),
      id: deriveSeedId({
        kind: 'assignment-audit',
        parentIds: [assignmentId, audit.action],
      }),
      action: audit.action,
      reason: audit.reason,
      occurredAt: audit.occurredAt,
    });
  }

  return cycle;
}

interface DayTimeAtInput {
  day: CalendarDay;
  time: string;
}

interface ShiftMomentInput {
  shift: PlannedShift;
}
