import type { AppConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import {
  addMilliseconds,
  compareCalendarDays,
  compareInstants,
  formatTimeOfDay,
  type Instant,
  now as nowInstant,
  parseCalendarDay,
  toDate,
  today,
  toTimeOfDay,
} from '@church/time';
import {
  CycleId,
  type EventTimeBlockId,
  type MinistryId,
  type ShiftId,
} from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  AnswerAvailabilityCheckInput,
  AssignmentDetail,
  CancelOwnAssignmentInput,
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
  GetAssignmentDetailInput,
  GetAvailabilityCheckInput,
  GetDashboardInput,
  GetMinistryScheduleInput,
  GetPublishedScheduleInput,
  IVolunteerManager,
  ListAvailabilityChecksInput,
  MinistrySchedule,
  RespondToAssignmentInput,
  VolunteerAvailabilityCheckDetail,
  VolunteerAvailabilityCheckSummary,
  VolunteerCheckShift,
  VolunteerDashboard,
  VolunteerPublishedSchedule,
  VolunteerPublishedScheduleSummary,
  VolunteerScheduleAssignment,
} from '../domain/contracts/application/volunteer-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type {
  AvailabilityCheckRepository,
  CheckContext,
  CheckShiftRow,
} from '../domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '../domain/contracts/infrastructure/cycle.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationRepository } from '../domain/contracts/infrastructure/notification.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '../domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type {
  Assignment,
  AssignmentStatus,
} from '../domain/entities/assignment';
import type { EventWithEventTimeBlocks } from '../domain/entities/event';
import type { ShiftRequirement } from '../domain/entities/shift-requirement';
import { isSwapRequestExpired } from '../domain/entities/swap-request';
import { AssignmentAccessDeniedError } from '../domain/errors/assignment-access-denied';
import { CancelWindowClosedError } from '../domain/errors/cancel-window-closed';
import { CheckAccessDeniedError } from '../domain/errors/check-access-denied';
import { IllegalStateTransitionError } from '../domain/errors/illegal-state-transition';
import { IsolationBreachError } from '../domain/errors/isolation-breach-error';
import { ShiftPublishedError } from '../domain/errors/shift-published';
import {
  assertUnavailableShiftsWithinScope,
  expandWholeDayShiftIds,
  resolveShiftAvailability,
} from '../domain/services/unavailable-shifts';

const NOTIFICATION_PREVIEW_LIMIT = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

interface DashboardAssignmentGroupDraft {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  items: DashboardAssignmentItem[];
}

interface InCancelledScopeInput {
  /** The Assignment's or Shift's Event with its blocks; absent reads as live. */
  group: EventWithEventTimeBlocks | undefined;
  eventTimeBlockId: EventTimeBlockId;
}

/** Cancelled work: its Event or its own EventTimeBlock is cancelled. */
function inCancelledScope({
  group,
  eventTimeBlockId,
}: InCancelledScopeInput): boolean {
  if (!group) return false;
  const { event, eventTimeBlocks } = group;
  const blockCancelled = eventTimeBlocks.some(
    ({ id, status }) => id === eventTimeBlockId && status === 'cancelled',
  );
  return event.status === 'cancelled' || blockCancelled;
}

function isPublishedStatus(
  status: AssignmentStatus,
): status is 'pending' | 'confirmed' | 'declined' {
  return (
    status === 'pending' || status === 'confirmed' || status === 'declined'
  );
}

interface RequirementCoverageStatusInput {
  status: AssignmentStatus;
}

function countsTowardRequirementCoverage({
  status,
}: RequirementCoverageStatusInput): boolean {
  return status === 'draft' || status === 'pending' || status === 'confirmed';
}

interface RequirementCoverageInput {
  requirement: ShiftRequirement;
  assignments: Assignment[];
}

/** The Assignments bound to one requirement, and how many places stay open. */
function projectRequirementCoverage({
  requirement,
  assignments,
}: RequirementCoverageInput) {
  const bound = assignments.filter(
    (assignment) => assignment.shiftRequirementId === requirement.id,
  );
  const filled = bound.filter((assignment) =>
    countsTowardRequirementCoverage({ status: assignment.status }),
  ).length;
  return { bound, openCount: Math.max(0, requirement.peopleNeeded - filled) };
}

function aggregateState(
  statuses: Array<'pending' | 'confirmed' | 'declined'>,
): 'pending' | 'confirmed' | 'mixed' | 'declined' {
  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0] ?? 'mixed';
  return 'mixed';
}

interface ScheduleShiftLabelInput {
  label?: string;
  startTime: Instant;
  endTime: Instant;
}

/** Fallback label when a Shift has none. No Church Timezone is available at
 * this layer, so this reads UTC — a seam-armed swap of the prior raw
 * `toLocaleTimeString`, not a timezone-correctness fix. */
function scheduleShiftLabel(shift: ScheduleShiftLabelInput): string {
  const start = formatTimeOfDay({
    time: toTimeOfDay({ instant: shift.startTime, timeZone: 'UTC' }),
  });
  const end = formatTimeOfDay({
    time: toTimeOfDay({ instant: shift.endTime, timeZone: 'UTC' }),
  });
  return shift.label ?? `${start} - ${end}`;
}

function scheduleVolunteerName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.at(-1);
  return lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName;
}

interface GetOwnedCheckContextInput extends GetAvailabilityCheckInput {
  lockForAnswer?: boolean;
  tx?: TransactionContext;
}

interface ResolveCheckDetailInput {
  context: CheckContext;
  input: GetAvailabilityCheckInput;
}

interface DbVolunteerManagerDependencies {
  volunteerRepo: VolunteerRepository;
  assignmentRepo: AssignmentRepository;
  swapRequestRepo: SwapRequestRepository;
  unavailableShiftRepo: UnavailableShiftRepository;
  notificationRepo: NotificationRepository;
  cycleRepo: CycleRepository;
  eventRepo: EventRepository;
  shiftRepo: ShiftRepository;
  ministryRepo: MinistryRepository;
  participationRepo: MinistryParticipationRepository;
  roleRepo: RoleRepository;
  availabilityCheckRepo: AvailabilityCheckRepository;
  churchRepo: ChurchRepository;
  authorityManager: Pick<IAuthorityManager, 'decideAuthority'>;
  unitOfWork: UnitOfWork;
  config: AppConfig;
}

export class DbVolunteerManager implements IVolunteerManager {
  private readonly volunteerRepo: VolunteerRepository;
  private readonly assignmentRepo: AssignmentRepository;
  private readonly swapRequestRepo: SwapRequestRepository;
  private readonly unavailableShiftRepo: UnavailableShiftRepository;
  private readonly notificationRepo: NotificationRepository;
  private readonly cycleRepo: CycleRepository;
  private readonly eventRepo: EventRepository;
  private readonly shiftRepo: ShiftRepository;
  private readonly ministryRepo: MinistryRepository;
  private readonly participationRepo: MinistryParticipationRepository;
  private readonly roleRepo: RoleRepository;
  private readonly availabilityCheckRepo: AvailabilityCheckRepository;
  private readonly churchRepo: ChurchRepository;
  private readonly authorityManager: Pick<IAuthorityManager, 'decideAuthority'>;
  private readonly unitOfWork: UnitOfWork;

  private readonly cancelLeadTimeDays: number;

  constructor({
    volunteerRepo,
    assignmentRepo,
    swapRequestRepo,
    unavailableShiftRepo,
    notificationRepo,
    cycleRepo,
    eventRepo,
    shiftRepo,
    ministryRepo,
    participationRepo,
    roleRepo,
    availabilityCheckRepo,
    churchRepo,
    authorityManager,
    unitOfWork,
    config,
  }: DbVolunteerManagerDependencies) {
    this.volunteerRepo = volunteerRepo;
    this.assignmentRepo = assignmentRepo;
    this.swapRequestRepo = swapRequestRepo;
    this.unavailableShiftRepo = unavailableShiftRepo;
    this.notificationRepo = notificationRepo;
    this.cycleRepo = cycleRepo;
    this.eventRepo = eventRepo;
    this.shiftRepo = shiftRepo;
    this.ministryRepo = ministryRepo;
    this.participationRepo = participationRepo;
    this.roleRepo = roleRepo;
    this.churchRepo = churchRepo;
    this.authorityManager = authorityManager;
    this.availabilityCheckRepo = availabilityCheckRepo;
    this.unitOfWork = unitOfWork;
    const { assignment } = config;
    this.cancelLeadTimeDays = assignment.cancelLeadTimeDays;
  }

  async getDashboard(input: GetDashboardInput): Promise<VolunteerDashboard> {
    const { userId, volunteerId, churchId } = input;
    const now = nowInstant();

    const memberMinistryIds = await this.volunteerRepo.listMemberMinistryIds({
      churchId,
      volunteerId,
    });
    const allMinistries = await this.ministryRepo.listByChurch({ churchId });
    const ministries = allMinistries
      .filter((m) => memberMinistryIds.includes(m.id as MinistryId))
      .map((m) => ({ id: m.id as string, name: m.name }));

    const ministryById = new Map(ministries.map((m) => [m.id, m]));

    // Assignment groups: upcoming published assignments grouped by event
    const allAssignments = await this.listPublishedAssignmentsForVolunteer({
      churchId,
      volunteerId,
    });
    const participationIds = [
      ...new Set(
        allAssignments
          .map((assignment) => assignment.participationId)
          .filter(
            (
              participationId,
            ): participationId is NonNullable<Assignment['participationId']> =>
              participationId != null,
          ),
      ),
    ];
    const participations = await this.participationRepo.listByIds({
      churchId,
      participationIds,
    });
    const participationsById = new Map(
      participations.map((participation) => [
        participation.id as string,
        participation,
      ]),
    );
    const eventIds = [...new Set(participations.map((item) => item.eventId))];
    const events = await Promise.all(
      eventIds.map((eventId) => this.eventRepo.getById({ churchId, eventId })),
    );
    const eventsById = new Map(
      events.map((event) => [event.id as string, event]),
    );

    const groupMap = new Map<string, DashboardAssignmentGroupDraft>();
    const assignmentShiftIds = [
      ...new Set(
        allAssignments
          .map((assignment) => assignment.shiftId)
          .filter(
            (shiftId): shiftId is NonNullable<Assignment['shiftId']> =>
              shiftId != null,
          ),
      ),
    ];
    const assignmentShifts = await Promise.all(
      assignmentShiftIds.map((shiftId) =>
        this.shiftRepo.getById({
          churchId,
          shiftId,
        }),
      ),
    );
    const assignmentShiftsById = new Map(
      assignmentShifts.map((shift) => [shift.id as string, shift]),
    );

    for (const assignment of allAssignments) {
      if (!isPublishedStatus(assignment.status)) continue;

      const shift = assignmentShiftsById.get(assignment.shiftId as string);
      const participation = participationsById.get(
        assignment.participationId as string,
      );
      if (
        !participation ||
        !shift ||
        compareInstants({ left: shift.endTime, right: now }) <= 0
      )
        continue;

      const event = eventsById.get(participation.eventId as string);
      const ministry = ministryById.get(participation.ministryId as string);
      if (!event || !ministry) continue;

      const role = await this.roleRepo.getById({
        churchId,
        id: assignment.roleId,
      });
      const timingState: 'in_progress' | 'upcoming' =
        compareInstants({ left: shift.startTime, right: now }) <= 0
          ? 'in_progress'
          : 'upcoming';

      const item: DashboardAssignmentItem = {
        assignmentId: assignment.id as string,
        eventTimeBlockId: assignment.eventTimeBlockId as string,
        shiftId: shift.id as string,
        participationId: participation.id as string,
        roleId: assignment.roleId as string,
        roleName: role.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: assignment.status,
        timingState,
        canRespond: timingState === 'upcoming',
      };

      const existing = groupMap.get(event.id as string);
      if (existing) {
        existing.items.push(item);
      } else {
        groupMap.set(event.id as string, {
          eventId: event.id as string,
          eventTitle: event.title,
          ministryId: participation.ministryId as string,
          ministryName: ministry.name,
          eventStart: event.start,
          items: [item],
        });
      }
    }

    const upcomingAssignmentGroups: DashboardAssignmentGroup[] = Array.from(
      groupMap.values(),
    )
      .map((group) => {
        const sorted = [...group.items].sort((a, b) =>
          compareInstants({
            left: a.startTime as Instant,
            right: b.startTime as Instant,
          }),
        );
        return {
          eventId: group.eventId,
          eventTitle: group.eventTitle,
          ministryId: group.ministryId,
          ministryName: group.ministryName,
          eventStart: group.eventStart,
          aggregateResponseState: aggregateState(sorted.map((i) => i.status)),
          hasPendingResponse: sorted.some((i) => i.status === 'pending'),
          assignments: sorted,
        };
      })
      .sort((a, b) =>
        compareInstants({
          left: a.eventStart as Instant,
          right: b.eventStart as Instant,
        }),
      );

    const [unreadNotificationCount, notificationPreviewResult] =
      await Promise.all([
        this.notificationRepo.countUnread({ churchId, userId }),
        this.notificationRepo.list({
          churchId,
          userId,
          limit: NOTIFICATION_PREVIEW_LIMIT,
        }),
      ]);
    const notificationPreview = notificationPreviewResult.items;

    const defaultMinistryId =
      upcomingAssignmentGroups[0]?.ministryId ?? ministries[0]?.id;

    return {
      upcomingAssignmentGroups,
      unreadNotificationCount,
      notificationPreview,
      defaultMinistryId,
      ministryOptions: ministries,
    };
  }

  async getPublishedSchedule(
    input: GetPublishedScheduleInput,
  ): Promise<VolunteerPublishedSchedule> {
    const { churchId, volunteerId } = input;
    const now = nowInstant();
    const memberMinistryIds = await this.volunteerRepo.listMemberMinistryIds({
      churchId,
      volunteerId,
    });
    const publishedLists = memberMinistryIds.map((ministryId) =>
      this.participationRepo.listByMinistry({
        churchId,
        ministryId,
        state: 'published',
      }),
    );
    const [allMinistries, assignments, publishedByMinistry, church] =
      await Promise.all([
        this.ministryRepo.listByChurch({ churchId }),
        this.listPublishedAssignmentsForVolunteer(input),
        Promise.all(publishedLists),
        this.churchRepo.getById({ id: churchId }),
      ]);
    const { timezone: timeZone } = church;
    const ministryNames = new Map(
      allMinistries.map((ministry) => [ministry.id as string, ministry.name]),
    );
    const assignmentParticipationIds = [
      ...new Set(assignments.map((a) => a.participationId)),
    ].filter((id): id is NonNullable<typeof id> => id != null);
    const assignmentParticipations =
      assignmentParticipationIds.length === 0
        ? []
        : await this.participationRepo.listByIds({
            churchId,
            participationIds: assignmentParticipationIds,
          });
    const allParticipations = [
      ...publishedByMinistry.flat(),
      ...assignmentParticipations,
    ];
    const participationsById = new Map(
      allParticipations.map((p) => [p.id as string, p]),
    );
    const eventIds = [...new Set(allParticipations.map((p) => p.eventId))];
    const eventEntries = await Promise.all(
      eventIds.map(async (eventId) => {
        const event = await this.eventRepo.getById({ churchId, eventId });
        return [eventId as string, event] as const;
      }),
    );
    const eventsById = new Map(eventEntries);

    const schedules = new Map<string, VolunteerPublishedScheduleSummary>();
    for (const participation of publishedByMinistry.flat()) {
      const event = eventsById.get(participation.eventId as string);
      const ministryName = ministryNames.get(
        participation.ministryId as string,
      );
      if (!event || ministryName === undefined) continue;
      const key = `${participation.ministryId}:${event.cycleId}`;
      if (schedules.has(key)) continue;
      schedules.set(key, {
        ministryId: participation.ministryId as string,
        ministryName,
        cycleId: event.cycleId as string,
        cycleName: '',
      });
    }
    const cycleIds = [
      ...new Set([...schedules.values()].map((s) => s.cycleId)),
    ];
    const cycleEntries = await Promise.all(
      cycleIds.map(async (cycleId) => {
        const cycle = await this.cycleRepo.getById({
          churchId,
          cycleId: CycleId.from(cycleId),
        });
        return [cycleId, cycle] as const;
      }),
    );
    const cycles = new Map(cycleEntries);
    const churchToday = today({ instant: now, timeZone });
    // A Cycle that ended before today in the Church Timezone is a past one (ADR-0003).
    const currentSchedules = [...schedules.values()].filter((schedule) => {
      const cycle = cycles.get(schedule.cycleId);
      return (
        !cycle ||
        compareCalendarDays({ left: cycle.endDate, right: churchToday }) >= 0
      );
    });
    const scheduleList = currentSchedules
      .map((s) => ({ ...s, cycleName: cycles.get(s.cycleId)?.name ?? '' }))
      .sort(
        (a, b) =>
          a.ministryName.localeCompare(b.ministryName) ||
          a.cycleName.localeCompare(b.cycleName),
      );

    const openSwapIds = new Set<string>(
      await this.swapRequestRepo.listOpenAssignmentIds({
        churchId,
        assignmentIds: assignments.map((a) => a.id),
      }),
    );
    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const participation = participationsById.get(
          assignment.participationId as string,
        );
        const { shiftId, roleId } = assignment;
        const requirementsRead = participation
          ? this.shiftRepo.listRequirementsByParticipation({
              churchId,
              participationId: participation.id,
            })
          : [];
        const [shift, role, requirements] = await Promise.all([
          this.shiftRepo.getById({
            churchId,
            shiftId: shiftId as NonNullable<Assignment['shiftId']>,
          }),
          this.roleRepo.getById({ churchId, id: roleId }),
          requirementsRead,
        ]);
        const event = participation
          ? eventsById.get(participation.eventId as string)
          : undefined;
        const shiftOver =
          compareInstants({ left: shift.endTime, right: now }) <= 0;
        // In progress counts: only Shifts already over drop out.
        if (!participation || !event || shiftOver) return undefined;
        const ownRequirement = requirements.find(
          (r) => r.id === assignment.shiftRequirementId,
        );
        const item: VolunteerScheduleAssignment = {
          assignmentId: assignment.id as string,
          eventId: event.id as string,
          eventTitle: event.title,
          shiftId: shift.id as string,
          startTime: shift.startTime,
          endTime: shift.endTime,
          ministryId: participation.ministryId as string,
          ministryName:
            ministryNames.get(participation.ministryId as string) ?? '',
          sectorName: ownRequirement?.sectorName ?? '',
          roleId: roleId as string,
          roleName: role.name,
          status: assignment.status as VolunteerScheduleAssignment['status'],
          // Same rule as the detail read: open past the Shift's start is expired.
          swapRequested:
            openSwapIds.has(assignment.id as string) &&
            !isSwapRequestExpired({
              status: 'open',
              shiftStart: shift.startTime,
              at: now,
            }),
        };
        return item;
      }),
    );

    return {
      assignments: items
        .filter((item): item is VolunteerScheduleAssignment => item != null)
        .sort((a, b) =>
          compareInstants({ left: a.startTime, right: b.startTime }),
        ),
      schedules: scheduleList,
    };
  }

  async getMinistrySchedule(
    input: GetMinistryScheduleInput,
  ): Promise<MinistrySchedule> {
    const { churchId, ministryId, volunteerId, cycleId } = input;

    const memberMinistryIds = await this.volunteerRepo.listMemberMinistryIds({
      churchId,
      volunteerId,
    });
    if (!memberMinistryIds.includes(ministryId)) {
      throw new IsolationBreachError();
    }

    const [ministry, cycle, participations, roles] = await Promise.all([
      this.ministryRepo.getById({ churchId, id: ministryId }),
      this.cycleRepo.getById({ churchId, cycleId }),
      this.participationRepo.listByMinistry({
        churchId,
        ministryId,
        state: 'published',
      }),
      this.roleRepo.listByMinistry({ churchId, ministryId }),
    ]);
    const allEventData = await Promise.all(
      participations.map(async (participation) => {
        const { id: participationId, eventId } = participation;
        const [group, shifts, requirements, assignments] = await Promise.all([
          this.eventRepo.getWithEventTimeBlocks({ churchId, eventId }),
          this.shiftRepo.listByParticipation({ churchId, participationId }),
          this.shiftRepo.listRequirementsByParticipation({
            churchId,
            participationId,
          }),
          this.assignmentRepo.listByParticipation({
            churchId,
            participationId,
          }),
        ]);
        // Cancelled work leaves the Volunteer's Schedule: a cancelled
        // Event drops out below, a cancelled block's Shifts drop out here.
        const liveShifts = shifts.filter(
          ({ eventTimeBlockId }) =>
            !inCancelledScope({ group, eventTimeBlockId }),
        );
        const liveIds = new Set(liveShifts.map(({ id }) => id as string));
        return {
          event: group.event,
          shifts: liveShifts,
          requirements: requirements.filter(({ shiftId }) =>
            liveIds.has(shiftId as string),
          ),
          assignments: assignments.filter(({ shiftId }) =>
            liveIds.has(shiftId as string),
          ),
        };
      }),
    );
    const cycleEventData = allEventData.filter(
      (item) => item.event.cycleId === cycleId,
    );
    const eventData = cycleEventData.filter(
      ({ event }) => event.status !== 'cancelled',
    );
    const assignments = eventData
      .flatMap((item) => item.assignments)
      .filter((assignment) => isPublishedStatus(assignment.status));
    const volunteerIds = [
      ...new Set(assignments.map((item) => item.volunteerId)),
    ];
    const volunteers = await this.volunteerRepo.listByIds({
      churchId,
      ids: volunteerIds,
    });
    const roleNames = new Map(
      roles.map((role) => [role.id as string, role.name]),
    );
    const volunteerNames = new Map(
      volunteers.map((volunteer) => [volunteer.id as string, volunteer.name]),
    );

    const events = eventData.map(
      ({ event, shifts, requirements, assignments: eventAssignments }) => {
        const activeAssignments = eventAssignments.filter((assignment) =>
          countsTowardRequirementCoverage({ status: assignment.status }),
        );
        const rows = shifts.flatMap((shift) => {
          const shiftAssignments = activeAssignments.filter(
            (assignment) => assignment.shiftId === shift.id,
          );
          const shiftRequirements = requirements.filter(
            (requirement) => requirement.shiftId === shift.id,
          );
          const shiftIdentity = {
            shiftId: shift.id as string,
            shiftLabel: scheduleShiftLabel(shift),
            shiftStart: shift.startTime,
            shiftEnd: shift.endTime,
          };
          return shiftRequirements.flatMap((requirement) => {
            const { bound, openCount } = projectRequirementCoverage({
              requirement,
              assignments: shiftAssignments,
            });
            const roleName =
              roleNames.get(requirement.roleId as string) ?? 'Unknown role';
            const place = {
              ...shiftIdentity,
              sectorName: requirement.sectorName,
              roleName,
            };
            const assignmentRows = bound.map((assignment) => ({
              ...place,
              volunteerDisplayName: scheduleVolunteerName(
                volunteerNames.get(assignment.volunteerId as string),
              ),
            }));
            const openRows = Array.from({ length: openCount }, () => ({
              ...place,
            }));
            return [...assignmentRows, ...openRows];
          });
        });
        return {
          eventId: event.id as string,
          title: event.title,
          start: event.start,
          end: event.end,
          assignmentCount: activeAssignments.length,
          rows,
        };
      },
    );

    return {
      ministryId: ministry.id as string,
      ministryName: ministry.name,
      cycleId: cycle.id as string,
      cycleName: cycle.name,
      // No published MinistryParticipation in the Cycle yet: "not published".
      published: cycleEventData.length > 0,
      events,
    };
  }

  async getAssignmentDetail(
    input: GetAssignmentDetailInput,
  ): Promise<AssignmentDetail> {
    const { churchId, assignmentId, volunteerId, userId } = input;
    const assignment = await this.assignmentRepo.getById({
      churchId,
      assignmentId,
    });
    // Self-service only (ADR-0009): the caller must be the Assignment's own Volunteer.
    const decision = await this.authorityManager.decideAuthority({
      churchId,
      userId,
      action: 'participate',
      resource: {
        type: 'church',
        churchId,
        ownerVolunteerId: assignment.volunteerId,
      },
      scope: 'object',
    });
    if (!decision.allowed) {
      throw new AssignmentAccessDeniedError();
    }
    const { shiftId, participationId } = assignment;
    if (!isPublishedStatus(assignment.status) || !shiftId || !participationId) {
      throw new NotFoundError(`Assignment not found: ${assignmentId}`);
    }
    const participation = await this.participationRepo.getById({
      churchId,
      participationId,
    });
    if (participation.state !== 'published') {
      throw new NotFoundError(`Assignment not found: ${assignmentId}`);
    }
    const { ministryId, eventId } = participation;

    const [shift, group, ministry, roles, requirements, shiftAssignments] =
      await Promise.all([
        this.shiftRepo.getById({ churchId, shiftId }),
        this.eventRepo.getWithEventTimeBlocks({ churchId, eventId }),
        this.ministryRepo.getById({ churchId, id: ministryId }),
        this.roleRepo.listByMinistry({ churchId, ministryId }),
        this.shiftRepo.listRequirementsByParticipation({
          churchId,
          participationId,
        }),
        this.assignmentRepo.listByShift({ churchId, shiftId }),
      ]);
    // A stale link to cancelled work reads as gone, like any other.
    const { eventTimeBlockId } = shift;
    if (inCancelledScope({ group, eventTimeBlockId })) {
      throw new NotFoundError(`Assignment not found: ${assignmentId}`);
    }
    const { event } = group;
    const memberships = await this.volunteerRepo.listMinistryMemberships({
      churchId,
      ministryId,
    });
    const leaderIds = memberships
      .filter((member) => member.ministryAccessLevel === 'leader')
      .map((member) => member.volunteerId);
    const published = shiftAssignments.filter((item) =>
      isPublishedStatus(item.status),
    );
    const personIds = [
      ...new Set([...leaderIds, ...published.map((i) => i.volunteerId)]),
    ];
    const people = await this.volunteerRepo.listByIds({
      churchId,
      ids: personIds,
    });
    const namesById = new Map(
      people.map((person) => [person.id as string, person.name]),
    );
    const roleNames = new Map(
      roles.map((role) => [role.id as string, role.name]),
    );
    const roleNameOf = (roleId: string) =>
      roleNames.get(roleId) ?? 'Unknown role';

    const roster = requirements
      .filter((requirement) => requirement.shiftId === shiftId)
      .map((requirement) => {
        const { bound, openCount } = projectRequirementCoverage({
          requirement,
          assignments: published,
        });
        return {
          sectorName: requirement.sectorName,
          roleName: roleNameOf(requirement.roleId as string),
          people: bound.map((item) => ({
            name:
              scheduleVolunteerName(
                namesById.get(item.volunteerId as string),
              ) ?? '',
            isYou: item.volunteerId === volunteerId,
          })),
          openCount,
        };
      })
      .sort(
        (a, b) =>
          a.sectorName.localeCompare(b.sectorName) ||
          a.roleName.localeCompare(b.roleName),
      );
    const ownRequirement = requirements.find(
      (requirement) => requirement.id === assignment.shiftRequirementId,
    );
    const [leaderName] = leaderIds
      .map((id) => namesById.get(id as string))
      .filter((name): name is string => !!name)
      .sort();

    // Only the raiser's own detail read reaches here, so the note is theirs to see.
    const latestSwapRequest = await this.swapRequestRepo.findLatestByAssignment(
      {
        churchId,
        assignmentId,
      },
    );

    return {
      assignmentId: assignment.id as string,
      eventId: event.id as string,
      eventTitle: event.title,
      startTime: shift.startTime,
      endTime: shift.endTime,
      cycleId: event.cycleId as string,
      ministryId: ministry.id as string,
      ministryName: ministry.name,
      sectorName: ownRequirement?.sectorName ?? '',
      roleName: roleNameOf(assignment.roleId as string),
      leaderName: leaderName ?? null,
      roster,
      swapRequest: latestSwapRequest
        ? {
            id: latestSwapRequest.id,
            status: isSwapRequestExpired({
              status: latestSwapRequest.status,
              shiftStart: shift.startTime,
              at: nowInstant(),
            })
              ? 'expired'
              : latestSwapRequest.status,
            note: latestSwapRequest.note ?? null,
            reply: latestSwapRequest.reply ?? null,
            raisedAt: latestSwapRequest.raisedAt,
          }
        : null,
    };
  }

  /**
   * Loads the actionable check context and enforces the check belongs to the
   * requesting volunteer. With `tx` it holds the membership against removal.
   */
  private async getOwnedCheckContext({
    tx,
    lockForAnswer,
    ...input
  }: GetOwnedCheckContextInput): Promise<CheckContext> {
    const context = await this.availabilityCheckRepo.getCheckContext({
      churchId: input.churchId,
      checkId: input.checkId,
      tx,
      lockForAnswer,
    });
    if ((context.volunteerId as string) !== (input.volunteerId as string)) {
      throw new CheckAccessDeniedError();
    }
    return context;
  }

  private async resolveCheckDetail({
    context,
    input,
  }: ResolveCheckDetailInput): Promise<VolunteerAvailabilityCheckDetail> {
    const [shifts, unavailableShifts] = await Promise.all([
      this.availabilityCheckRepo.listCheckShifts({
        churchId: input.churchId,
        checkId: input.checkId,
        heldRolesOnly: true,
      }),
      this.unavailableShiftRepo.listUnavailableShiftsByCheck({
        churchId: input.churchId,
        availabilityCheckId: input.checkId,
      }),
    ]);

    const resolutions = resolveShiftAvailability({
      shiftIds: shifts.map((shift) => shift.shiftId),
      unavailableShiftIds: unavailableShifts.map(
        (unavailableShift) => unavailableShift.shiftId,
      ),
    });
    const availableByShiftId = new Map(
      resolutions.map((entry) => [entry.shiftId, entry.available]),
    );

    const checkShifts: VolunteerCheckShift[] = shifts.map(
      (shift: CheckShiftRow) => ({
        shiftId: shift.shiftId as string,
        eventId: shift.eventId as string,
        eventTitle: shift.eventTitle,
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: shift.label,
        published: shift.published,
        available: availableByShiftId.get(shift.shiftId) ?? true,
      }),
    );

    return {
      id: context.check.id as string,
      cycleId: context.check.cycleId as string,
      cycleName: context.cycleName,
      ministryId: context.ministryId as string,
      ministryName: context.ministryName,
      state: context.check.state,
      confirmedAt: context.check.confirmedAt,
      answerBy: context.answerBy,
      readOnly: context.readOnly,
      shifts: checkShifts,
    };
  }

  async listAvailabilityChecks(
    input: ListAvailabilityChecksInput,
  ): Promise<VolunteerAvailabilityCheckSummary[]> {
    const contexts = await this.availabilityCheckRepo.listByVolunteer({
      churchId: input.churchId,
      volunteerId: input.volunteerId,
    });

    return Promise.all(
      contexts.map(async (context) => {
        const checkId = context.check.id;
        const [shifts, unavailableShifts] = await Promise.all([
          this.availabilityCheckRepo.listCheckShifts({
            churchId: input.churchId,
            checkId,
            heldRolesOnly: true,
          }),
          this.unavailableShiftRepo.listUnavailableShiftsByCheck({
            churchId: input.churchId,
            availabilityCheckId: checkId,
          }),
        ]);

        return {
          id: checkId as string,
          cycleId: context.check.cycleId as string,
          cycleName: context.cycleName,
          ministryId: context.ministryId as string,
          ministryName: context.ministryName,
          state: context.check.state,
          confirmedAt: context.check.confirmedAt,
          answerBy: context.answerBy,
          totalShiftCount: shifts.length,
          unavailableShiftCount: shifts.filter((shift) =>
            unavailableShifts.some((mark) => mark.shiftId === shift.shiftId),
          ).length,
        };
      }),
    );
  }

  async getAvailabilityCheck(
    input: GetAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail> {
    const context = await this.getOwnedCheckContext(input);
    return this.resolveCheckDetail({ context, input });
  }

  async answerAvailabilityCheck(
    input: AnswerAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail> {
    const context = await this.unitOfWork.run(async (tx) => {
      const owned = await this.getOwnedCheckContext({ ...input, tx });
      await this.participationRepo.lockSchedule({
        churchId: input.churchId,
        ministryId: owned.ministryId,
        cycleId: owned.check.cycleId,
        tx,
      });
      const context = await this.getOwnedCheckContext({
        ...input,
        tx,
        lockForAnswer: true,
      });
      if (context.readOnly) {
        throw new IllegalStateTransitionError({ from: 'past', to: 'answer' });
      }
      const shifts = await this.availabilityCheckRepo.listCheckShifts({
        churchId: input.churchId,
        checkId: input.checkId,
        heldRolesOnly: true,
        tx,
      });

      const wholeDayShiftIds = (input.wholeDayDates ?? []).flatMap((date) =>
        expandWholeDayShiftIds({
          churchDate: parseCalendarDay({ value: date }),
          timeZone: context.timeZone,
          shifts,
        }),
      );
      const requestedShiftIds = [
        ...new Set<ShiftId>([...input.shiftIds, ...wholeDayShiftIds]),
      ];

      assertUnavailableShiftsWithinScope({
        candidateShiftIds: shifts.map((shift) => shift.shiftId),
        requestedShiftIds,
      });

      const publishedShiftIds = shifts
        .filter(
          (shift) =>
            shift.published && requestedShiftIds.includes(shift.shiftId),
        )
        .map((shift) => shift.shiftId);
      if (publishedShiftIds.length > 0) {
        throw new ShiftPublishedError({ shiftIds: publishedShiftIds });
      }

      // Published answers are locked history, even when their Role is no longer held.
      const [existingMarks, scopedShifts] = await Promise.all([
        this.unavailableShiftRepo.listUnavailableShiftsByCheck({
          churchId: input.churchId,
          availabilityCheckId: input.checkId,
          tx,
        }),
        this.availabilityCheckRepo.listCheckShifts({
          churchId: input.churchId,
          checkId: input.checkId,
          tx,
        }),
      ]);
      const lockedShiftIds = new Set(
        scopedShifts
          .filter((shift) => shift.published)
          .map((shift) => shift.shiftId),
      );
      const preservedShiftIds = existingMarks
        .filter((mark) => lockedShiftIds.has(mark.shiftId))
        .map((mark) => mark.shiftId);
      const nextShiftIds = [...preservedShiftIds, ...requestedShiftIds];
      await this.unavailableShiftRepo.replaceUnavailableShiftsForCheck({
        churchId: input.churchId,
        availabilityCheckId: input.checkId,
        shiftIds: nextShiftIds,
        tx,
      });
      if (context.check.state === 'pending') {
        context.check.confirm();
        const confirmedAt = context.check.confirmedAt ?? nowInstant();
        await this.availabilityCheckRepo.confirm({
          churchId: input.churchId,
          checkId: input.checkId,
          confirmedAt: toDate({ instant: confirmedAt }),
          tx,
        });
      }
      return context;
    });

    return this.resolveCheckDetail({ context, input });
  }

  async respondToAssignment(
    input: RespondToAssignmentInput,
  ): Promise<Assignment> {
    const { assignmentId, churchId, volunteerId, response, reason } = input;
    const assignment = await this.assignmentRepo.getById({
      churchId,
      assignmentId,
    });
    if (assignment.volunteerId !== volunteerId) {
      throw new AssignmentAccessDeniedError();
    }
    const status = response === 'accepted' ? 'confirmed' : 'declined';
    await this.assignmentRepo.updateStatus({
      churchId,
      assignmentId,
      input: {
        status,
        reason,
      },
    });
    return this.assignmentRepo.getById({ churchId, assignmentId });
  }

  async cancelOwnAssignment(input: CancelOwnAssignmentInput): Promise<void> {
    const { assignmentId, churchId, volunteerId } = input;
    const assignment = await this.assignmentRepo.getById({
      churchId,
      assignmentId,
    });
    if (assignment.volunteerId !== volunteerId) {
      throw new AssignmentAccessDeniedError();
    }

    if (assignment.shiftId) {
      const shift = await this.shiftRepo.getById({
        churchId,
        shiftId: assignment.shiftId,
      });
      const cancelLeadTimeMs = this.cancelLeadTimeDays * MILLISECONDS_PER_DAY;
      const cutoff = addMilliseconds({
        instant: shift.startTime,
        milliseconds: -cancelLeadTimeMs,
      });
      if (compareInstants({ left: nowInstant(), right: cutoff }) >= 0) {
        throw new CancelWindowClosedError();
      }
    }

    await this.assignmentRepo.deleteById({ churchId, assignmentId });
  }

  private async listPublishedAssignmentsForVolunteer({
    volunteerId,
    churchId,
  }: GetPublishedScheduleInput): Promise<Assignment[]> {
    const assignments = await this.assignmentRepo.listByVolunteer({
      churchId,
      volunteerId,
    });
    const participationIds = [
      ...new Set(
        assignments
          .map((assignment) => assignment.participationId)
          .filter(
            (
              participationId,
            ): participationId is NonNullable<Assignment['participationId']> =>
              participationId != null,
          ),
      ),
    ];
    if (participationIds.length === 0) {
      return [];
    }

    const participations = await this.participationRepo.listByIds({
      churchId,
      participationIds,
    });
    const published = participations.filter(
      (participation) => participation.state === 'published',
    );
    const eventIds = [...new Set(published.map(({ eventId }) => eventId))];
    const groups = await Promise.all(
      eventIds.map((eventId) =>
        this.eventRepo.getWithEventTimeBlocks({ churchId, eventId }),
      ),
    );
    const groupsByEvent = new Map(
      groups.map((group) => [group.event.id as string, group]),
    );
    const groupsByParticipation = new Map(
      published.map(({ id, eventId }) => [
        id as string,
        groupsByEvent.get(eventId as string),
      ]),
    );

    return assignments.filter(
      ({ status, participationId, eventTimeBlockId }) =>
        isPublishedStatus(status) &&
        groupsByParticipation.has(participationId as string) &&
        !inCancelledScope({
          group: groupsByParticipation.get(participationId as string),
          eventTimeBlockId,
        }),
    );
  }
}
