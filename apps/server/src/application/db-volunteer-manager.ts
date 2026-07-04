import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  ChurchId,
  MinistryId,
  ShiftId,
  UserId,
} from '../domain/branded-ids';
import type {
  AvailabilityOverlapItem,
  ConfirmAvailabilityCheckInput,
  ConfirmAvailabilityCheckResult,
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
  DashboardAvailabilityTask,
  GetAvailabilityCheckInput,
  GetDashboardInput,
  GetMinistryScheduleInput,
  GetNotificationsInput,
  GetPublishedScheduleInput,
  GetUpcomingAssignmentsInput,
  IVolunteerManager,
  ListAvailabilityChecksInput,
  MarkAllNotificationsReadInput,
  MarkNotificationReadInput,
  MinistrySchedule,
  NotificationListResult,
  RespondToAssignmentInput,
  SetUnavailabilityInput,
  VolunteerAvailabilityCheckDetail,
  VolunteerAvailabilityCheckSummary,
  VolunteerCheckShift,
  VolunteerContext,
  VolunteerDashboard,
} from '../domain/contracts/application/volunteer-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import type {
  AvailabilityCheckRepository,
  CheckContext,
  CheckShiftRow,
} from '../domain/contracts/infrastructure/availability-check.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { IFeatureFlagService } from '../domain/contracts/infrastructure/feature-flag-service';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { TeamRepository } from '../domain/contracts/infrastructure/team.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { VolunteerNotificationRepository } from '../domain/contracts/infrastructure/volunteer-notification.repository';
import type {
  Assignment,
  AssignmentStatus,
} from '../domain/entities/assignment';
import type { Availability } from '../domain/entities/availability';
import type { TimeSlot } from '../domain/entities/time-slot';
import { AvailabilityOverlapError } from '../domain/errors/availability-overlap';
import { CheckAccessDeniedError } from '../domain/errors/check-access-denied';
import { IsolationBreachError } from '../domain/errors/isolation-breach-error';
import {
  assertMarksWithinScope,
  expandWholeDayShiftIds,
  resolveShiftAvailability,
} from '../domain/services/availability-marks';
import type { ShiftOverlapPair } from '../domain/services/availability-overlap';
import { detectCrossMinistryOverlaps } from '../domain/services/availability-overlap';

const UPCOMING_DAYS = 30;
const DEFAULT_NOTIFICATION_LIMIT = 20;
const NOTIFICATION_PREVIEW_LIMIT = 3;

interface NotifyLeadersOfOverlapInput {
  churchId: ChurchId;
  planningCycleId: string;
  overlapPairs: ShiftOverlapPair[];
}

interface DashboardAssignmentGroupDraft {
  eventId: string;
  eventTitle: string;
  ministryId: string;
  ministryName: string;
  eventStart: string;
  items: DashboardAssignmentItem[];
}

function slotKey(startTime: Date, endTime: Date): string {
  return `${startTime.toISOString()}::${endTime.toISOString()}`;
}

function availabilityCompletionState(
  entries: Availability[],
  slots: TimeSlot[],
): 'missing' | 'partial' | 'complete' {
  if (slots.length === 0) return 'missing';
  const matchingKeys = new Set(
    entries.map((e) => slotKey(e.shiftStartTime, e.shiftEndTime)),
  );
  const answered = slots.filter((s) =>
    matchingKeys.has(slotKey(s.startTime, s.endTime)),
  ).length;
  if (answered === 0) return 'missing';
  return answered >= slots.length ? 'complete' : 'partial';
}

function isPublishedStatus(
  status: AssignmentStatus,
): status is 'pending' | 'confirmed' | 'declined' {
  return (
    status === 'pending' || status === 'confirmed' || status === 'declined'
  );
}

function aggregateState(
  statuses: Array<'pending' | 'confirmed' | 'declined'>,
): 'pending' | 'confirmed' | 'mixed' | 'declined' {
  const unique = new Set(statuses);
  if (unique.size === 1) return statuses[0] ?? 'mixed';
  return 'mixed';
}

function scheduleShiftLabel(shift: {
  label?: string;
  startTime: Date;
  endTime: Date;
}): string {
  return (
    shift.label ??
    `${shift.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${shift.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  );
}

function scheduleVolunteerName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.at(-1);
  return lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName;
}

@injectable()
export class DbVolunteerManager implements IVolunteerManager {
  constructor(
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
    @inject('IAssignmentRepository')
    private readonly assignmentRepo: AssignmentRepository,
    @inject('IAvailabilityRepository')
    private readonly availabilityRepo: AvailabilityRepository,
    @inject('IVolunteerNotificationRepository')
    private readonly notificationRepo: VolunteerNotificationRepository,
    @inject('IEventRepository')
    private readonly eventRepo: EventRepository,
    @inject('IShiftRepository')
    private readonly shiftRepo: ShiftRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepo: MinistryRepository,
    @inject('IMinistryParticipationRepository')
    private readonly participationRepo: MinistryParticipationRepository,
    @inject('IRoleRepository')
    private readonly roleRepo: RoleRepository,
    @inject('ITeamRepository')
    private readonly teamRepo: TeamRepository,
    @inject('IAvailabilityCheckRepository')
    private readonly availabilityCheckRepo: AvailabilityCheckRepository,
    @inject('IFeatureFlagService')
    private readonly featureFlagService: IFeatureFlagService,
    @inject('INotificationService')
    private readonly notificationService: NotificationService,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async resolveVolunteerContext(
    userId: UserId,
  ): Promise<VolunteerContext | null> {
    const volunteer = await this.volunteerRepo.findByUserIdGlobally(userId);
    if (!volunteer) return null;
    const [ledMinistries, isAdmin] = await Promise.all([
      this.volunteerRepo.listLedMinistries(volunteer.churchId, volunteer.id),
      this.volunteerRepo.isChurchAdmin(volunteer.churchId, userId),
    ]);
    return {
      volunteerId: volunteer.id,
      churchId: volunteer.churchId,
      isAdmin,
      isLeader: ledMinistries.length > 0,
    };
  }

  async getDashboard(input: GetDashboardInput): Promise<VolunteerDashboard> {
    const { volunteerId, churchId } = input;
    const now = new Date();

    const memberMinistryIds = await this.volunteerRepo.listMemberMinistryIds(
      churchId,
      volunteerId,
    );
    const allMinistries = await this.ministryRepo.listByChurch(churchId);
    const ministries = allMinistries
      .filter((m) => memberMinistryIds.includes(m.id as MinistryId))
      .map((m) => ({ id: m.id as string, name: m.name }));

    const ministryById = new Map(ministries.map((m) => [m.id, m]));

    // Availability tasks: future events with incomplete availability
    const availabilityTasksNested = await Promise.all(
      ministries.map(async (ministry) => {
        const events = await this.eventRepo.listByMinistry(
          churchId,
          ministry.id as MinistryId,
        );
        return Promise.all(
          events.map(
            async (event): Promise<DashboardAvailabilityTask | null> => {
              if (event.startDate <= now) return null;
              const eventWithSlots = await this.eventRepo.getWithSlots(
                churchId,
                event.id,
              );
              if (eventWithSlots.slots.length === 0) return null;
              const entries =
                await this.availabilityRepo.listByVolunteerForEvent(
                  churchId,
                  volunteerId,
                  event.id,
                );
              const completionState = availabilityCompletionState(
                entries,
                eventWithSlots.slots,
              );
              if (completionState === 'complete') return null;
              return {
                eventId: event.id as string,
                eventTitle: event.title,
                ministryId: ministry.id,
                ministryName: ministry.name,
                eventType: event.eventType,
                eventStart: event.startDate.toISOString(),
                eventEnd: event.endDate.toISOString(),
                completionState,
              };
            },
          ),
        );
      }),
    );

    const availabilityTasks = availabilityTasksNested
      .flat()
      .filter((t): t is DashboardAvailabilityTask => t != null)
      .sort(
        (a, b) =>
          new Date(a.eventStart).getTime() - new Date(b.eventStart).getTime(),
      );

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
      eventIds.map((eventId) => this.eventRepo.getById(churchId, eventId)),
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
      if (!participation || !shift || shift.endTime <= now) continue;

      const event = eventsById.get(participation.eventId as string);
      const ministry = ministryById.get(participation.ministryId as string);
      if (!event || !ministry) continue;

      const role = await this.roleRepo.getById(churchId, assignment.roleId);
      const timingState: 'in_progress' | 'upcoming' =
        shift.startTime <= now ? 'in_progress' : 'upcoming';

      const item: DashboardAssignmentItem = {
        assignmentId: assignment.id as string,
        slotId: assignment.slotId as string,
        shiftId: shift.id as string,
        participationId: participation.id as string,
        roleId: assignment.roleId as string,
        roleName: role.name,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
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
          eventStart: event.startDate.toISOString(),
          items: [item],
        });
      }
    }

    const upcomingAssignmentGroups: DashboardAssignmentGroup[] = Array.from(
      groupMap.values(),
    )
      .map((group) => {
        const sorted = [...group.items].sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
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
      .sort(
        (a, b) =>
          new Date(a.eventStart).getTime() - new Date(b.eventStart).getTime(),
      );

    const [unreadNotificationCount, notificationPreviewResult] =
      await Promise.all([
        this.notificationRepo.countUnread(churchId, volunteerId),
        this.notificationRepo.listByVolunteer(churchId, {
          volunteerId,
          limit: NOTIFICATION_PREVIEW_LIMIT,
        }),
      ]);

    const notificationPreview = notificationPreviewResult.items.map((n) => ({
      id: n.id as string,
      type: n.type,
      title: n.title,
      body: n.body,
      readAt: n.readAt?.toISOString(),
      createdAt: n.createdAt.toISOString(),
    }));

    const defaultMinistryId =
      upcomingAssignmentGroups[0]?.ministryId ?? ministries[0]?.id;

    return {
      availabilityTasks,
      upcomingAssignmentGroups,
      unreadNotificationCount,
      notificationPreview,
      defaultMinistryId,
      ministryOptions: ministries,
    };
  }

  async getUpcomingAssignments(
    input: GetUpcomingAssignmentsInput,
  ): Promise<Assignment[]> {
    const { churchId } = input;
    const now = new Date();
    const future = new Date(
      now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000,
    );
    const assignments = await this.listPublishedAssignmentsForVolunteer(input);
    const shifts = await Promise.all(
      assignments
        .map((assignment) => assignment.shiftId)
        .filter(
          (shiftId): shiftId is NonNullable<Assignment['shiftId']> =>
            shiftId != null,
        )
        .map((shiftId) =>
          this.shiftRepo.getById({
            churchId,
            shiftId,
          }),
        ),
    );
    const shiftsById = new Map(
      shifts.map((shift) => [shift.id as string, shift]),
    );

    return assignments.filter((assignment) => {
      const shift = shiftsById.get(assignment.shiftId as string);
      return (
        shift != null && shift.startTime >= now && shift.startTime <= future
      );
    });
  }

  async getPublishedSchedule(
    input: GetPublishedScheduleInput,
  ): Promise<Assignment[]> {
    return this.listPublishedAssignmentsForVolunteer(input);
  }

  async getMinistrySchedule(
    input: GetMinistryScheduleInput,
  ): Promise<MinistrySchedule> {
    const { churchId, ministryId, volunteerId } = input;

    const memberMinistryIds = await this.volunteerRepo.listMemberMinistryIds(
      churchId,
      volunteerId,
    );
    if (!memberMinistryIds.includes(ministryId)) {
      throw new IsolationBreachError();
    }

    const [ministry, participations, roles, memberships] = await Promise.all([
      this.ministryRepo.getById(churchId, ministryId),
      this.participationRepo.listByMinistry({
        churchId,
        ministryId,
        state: 'published',
      }),
      this.roleRepo.listByMinistry(churchId, ministryId),
      this.volunteerRepo.listMinistryMemberships(churchId, ministryId),
    ]);
    const eventData = await Promise.all(
      participations.map(async (participation) => ({
        event: await this.eventRepo.getById(churchId, participation.eventId),
        shifts: await this.shiftRepo.listByParticipation({
          churchId,
          participationId: participation.id,
        }),
        requirements: await this.shiftRepo.listRequirementsByParticipation({
          churchId,
          participationId: participation.id,
        }),
        assignments: await this.assignmentRepo.listByParticipation(
          churchId,
          participation.id,
        ),
      })),
    );
    const assignments = eventData
      .flatMap((item) => item.assignments)
      .filter((assignment) => isPublishedStatus(assignment.status));
    const volunteerIds = [
      ...new Set(assignments.map((item) => item.volunteerId)),
    ];
    const teamIds = [
      ...new Set(
        eventData.flatMap((item) =>
          item.requirements.flatMap((requirement) =>
            requirement.teamId ? [requirement.teamId] : [],
          ),
        ),
      ),
    ];
    const [volunteers, teams] = await Promise.all([
      this.volunteerRepo.listByIds(churchId, volunteerIds),
      this.teamRepo.listByIds(churchId, teamIds),
    ]);
    const roleNames = new Map(
      roles.map((role) => [role.id as string, role.name]),
    );
    const volunteerNames = new Map(
      volunteers.map((volunteer) => [volunteer.id as string, volunteer.name]),
    );
    const teamNames = new Map(
      teams.map((team) => [team.id as string, team.name]),
    );
    const membershipTeams = new Map(
      memberships.map((membership) => [
        membership.volunteerId as string,
        membership.teamId,
      ]),
    );

    return {
      ministryId: ministry.id as string,
      ministryName: ministry.name,
      events: eventData.map(
        ({ event, shifts, requirements, assignments: eventAssignments }) => {
          const activeAssignments = eventAssignments.filter((assignment) =>
            isPublishedStatus(assignment.status),
          );
          const rows = shifts.flatMap((shift) => {
            const shiftAssignments = activeAssignments.filter(
              (assignment) => assignment.shiftId === shift.id,
            );
            const shiftRequirements = requirements.filter(
              (requirement) => requirement.shiftId === shift.id,
            );
            const assignmentRows = shiftAssignments.map((assignment) => {
              const teamId =
                membershipTeams.get(assignment.volunteerId as string) ?? null;
              return {
                slotId: shift.timeSlotId as string,
                slotLabel: scheduleShiftLabel(shift),
                roleName:
                  roleNames.get(assignment.roleId as string) ?? 'Unknown role',
                teamName: teamId ? teamNames.get(teamId as string) : undefined,
                volunteerDisplayName: scheduleVolunteerName(
                  volunteerNames.get(assignment.volunteerId as string),
                ),
                confirmationState: isPublishedStatus(assignment.status)
                  ? assignment.status
                  : 'pending',
              };
            });
            const openRows = shiftRequirements.flatMap((requirement) => {
              const assignedCount = shiftAssignments.filter(
                (assignment) =>
                  assignment.roleId === requirement.roleId &&
                  (membershipTeams.get(assignment.volunteerId as string) ??
                    null) === (requirement.teamId ?? null),
              ).length;
              return Array.from(
                {
                  length: Math.max(
                    0,
                    requirement.requiredCount - assignedCount,
                  ),
                },
                () => ({
                  slotId: shift.timeSlotId as string,
                  slotLabel: scheduleShiftLabel(shift),
                  roleName:
                    roleNames.get(requirement.roleId as string) ??
                    'Unknown role',
                  teamName: requirement.teamId
                    ? teamNames.get(requirement.teamId as string)
                    : undefined,
                  confirmationState: 'open' as const,
                }),
              );
            });
            return [...assignmentRows, ...openRows];
          });
          return {
            eventId: event.id as string,
            title: event.title,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate.toISOString(),
            assignmentCount: activeAssignments.length,
            rows,
          };
        },
      ),
    };
  }

  /** Loads the check context and enforces the check belongs to the requesting volunteer. */
  private async getOwnedCheckContext(
    input: GetAvailabilityCheckInput,
  ): Promise<CheckContext> {
    const context = await this.availabilityCheckRepo.getCheckContext({
      churchId: input.churchId,
      checkId: input.checkId,
    });
    if ((context.volunteerId as string) !== (input.volunteerId as string)) {
      throw new CheckAccessDeniedError();
    }
    return context;
  }

  private async resolveCheckDetail(
    context: CheckContext,
    input: GetAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail> {
    const [shifts, marks] = await Promise.all([
      this.availabilityCheckRepo.listCheckShifts({
        churchId: input.churchId,
        checkId: input.checkId,
      }),
      this.availabilityRepo.listMarksByCheck({
        churchId: input.churchId,
        availabilityCheckId: input.checkId,
      }),
    ]);

    const resolutions = resolveShiftAvailability({
      shiftIds: shifts.map((shift) => shift.shiftId),
      markedShiftIds: marks.map((mark) => mark.shiftId),
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
        available: availableByShiftId.get(shift.shiftId) ?? true,
      }),
    );

    return {
      id: context.check.id as string,
      planningCycleId: context.check.planningCycleId as string,
      planningCycleName: context.planningCycleName,
      ministryId: context.ministryId as string,
      ministryName: context.ministryName,
      state: context.check.state,
      confirmedAt: context.check.confirmedAt,
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
        const [shifts, marks] = await Promise.all([
          this.availabilityCheckRepo.listCheckShifts({
            churchId: input.churchId,
            checkId,
          }),
          this.availabilityRepo.listMarksByCheck({
            churchId: input.churchId,
            availabilityCheckId: checkId,
          }),
        ]);

        return {
          id: checkId as string,
          planningCycleId: context.check.planningCycleId as string,
          planningCycleName: context.planningCycleName,
          ministryId: context.ministryId as string,
          ministryName: context.ministryName,
          state: context.check.state,
          confirmedAt: context.check.confirmedAt,
          totalShiftCount: shifts.length,
          unavailableShiftCount: marks.length,
        };
      }),
    );
  }

  async getAvailabilityCheck(
    input: GetAvailabilityCheckInput,
  ): Promise<VolunteerAvailabilityCheckDetail> {
    const context = await this.getOwnedCheckContext(input);
    return this.resolveCheckDetail(context, input);
  }

  async setUnavailability(
    input: SetUnavailabilityInput,
  ): Promise<VolunteerAvailabilityCheckDetail> {
    const context = await this.getOwnedCheckContext(input);
    const shifts = await this.availabilityCheckRepo.listCheckShifts({
      churchId: input.churchId,
      checkId: input.checkId,
    });

    const wholeDayShiftIds = (input.wholeDayDates ?? []).flatMap((date) =>
      expandWholeDayShiftIds({
        churchDate: date,
        timeZone: context.timeZone,
        shifts,
      }),
    );
    const requestedShiftIds = [
      ...new Set<ShiftId>([...input.shiftIds, ...wholeDayShiftIds]),
    ];

    assertMarksWithinScope({
      candidateShiftIds: shifts.map((shift) => shift.shiftId),
      requestedShiftIds,
    });

    await this.unitOfWork.run(async (tx) => {
      await this.availabilityRepo.replaceMarksForCheck({
        churchId: input.churchId,
        availabilityCheckId: input.checkId,
        shiftIds: requestedShiftIds,
        tx,
      });
    });

    return this.resolveCheckDetail(context, input);
  }

  async confirmAvailabilityCheck(
    input: ConfirmAvailabilityCheckInput,
  ): Promise<ConfirmAvailabilityCheckResult> {
    const context = await this.getOwnedCheckContext(input);

    // Entity transition guards the confirm gate (pending → confirmed, FR-019).
    context.check.confirm();

    const unmarkedShifts =
      await this.availabilityCheckRepo.listUnmarkedVolunteerShifts({
        churchId: input.churchId,
        volunteerId: input.volunteerId,
        planningCycleId: context.check.planningCycleId,
      });
    const overlapPairs = detectCrossMinistryOverlaps({
      shifts: unmarkedShifts,
    });

    if (overlapPairs.length > 0) {
      const allowOverlapSave = await this.featureFlagService.isEnabled(
        'VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE',
      );
      if (!allowOverlapSave) {
        throw new AvailabilityOverlapError();
      }
    }

    const confirmedAt = context.check.confirmedAt ?? new Date();
    await this.availabilityCheckRepo.confirm({
      churchId: input.churchId,
      checkId: input.checkId,
      confirmedAt,
    });

    const overlaps: AvailabilityOverlapItem[] = overlapPairs.map((pair) => ({
      shiftId: pair.first.shiftId as string,
      otherShiftId: pair.second.shiftId as string,
      ministryId: pair.first.ministryId as string,
      otherMinistryId: pair.second.ministryId as string,
    }));

    if (overlaps.length > 0) {
      await this.notifyLeadersOfOverlap({
        churchId: input.churchId,
        planningCycleId: context.check.planningCycleId as string,
        overlapPairs,
      });
    }

    return {
      state: 'confirmed',
      confirmedAt,
      overlaps,
    };
  }

  private async notifyLeadersOfOverlap({
    churchId,
    planningCycleId,
    overlapPairs,
  }: NotifyLeadersOfOverlapInput): Promise<void> {
    const ministryIds = [
      ...new Set(
        overlapPairs.flatMap((pair) => [
          pair.first.ministryId,
          pair.second.ministryId,
        ]),
      ),
    ];
    const leaders =
      await this.availabilityCheckRepo.listMinistryLeaderVolunteerIds({
        churchId,
        ministryIds,
      });

    for (const leader of leaders) {
      await this.notificationService.notifyVolunteer({
        churchId: churchId as string,
        volunteerId: leader.volunteerId as string,
        ministryId: leader.ministryId,
        type: 'availability_conflict',
        title: 'Availability conflict',
        body: 'A volunteer confirmed availability that overlaps another ministry in the same planning period.',
        payload: {
          planningCycleId,
          ministryId: leader.ministryId as string,
        },
      });
    }
  }

  async respondToAssignment(
    input: RespondToAssignmentInput,
  ): Promise<Assignment> {
    const { assignmentId, churchId, response, reason } = input;
    const status = response === 'accepted' ? 'confirmed' : 'declined';
    await this.assignmentRepo.updateStatus(churchId, assignmentId, {
      status,
      reason,
    });
    return this.assignmentRepo.getById(churchId, assignmentId);
  }

  async getNotifications(
    input: GetNotificationsInput,
  ): Promise<NotificationListResult> {
    const {
      volunteerId,
      churchId,
      cursor,
      limit = DEFAULT_NOTIFICATION_LIMIT,
    } = input;
    return this.notificationRepo.listByVolunteer(churchId, {
      volunteerId,
      cursor,
      limit,
    });
  }

  async markNotificationRead(input: MarkNotificationReadInput): Promise<void> {
    const { notificationId, volunteerId, churchId } = input;
    await this.notificationRepo.markRead(churchId, volunteerId, notificationId);
  }

  async markAllNotificationsRead(
    input: MarkAllNotificationsReadInput,
  ): Promise<void> {
    await this.notificationRepo.markAllRead(input.churchId, input.volunteerId);
  }

  private async listPublishedAssignmentsForVolunteer({
    volunteerId,
    churchId,
  }: GetPublishedScheduleInput): Promise<Assignment[]> {
    const assignments = await this.assignmentRepo.listByVolunteer(
      churchId,
      volunteerId,
    );
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
    const publishedParticipationIds = new Set(
      participations
        .filter((participation) => participation.state === 'published')
        .map((participation) => participation.id as string),
    );

    return assignments.filter(
      (assignment) =>
        isPublishedStatus(assignment.status) &&
        publishedParticipationIds.has(assignment.participationId as string),
    );
  }
}
