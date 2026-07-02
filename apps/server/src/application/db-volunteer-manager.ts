import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  AvailabilityId,
  ChurchId,
  MinistryId,
  UserId,
  VolunteerId,
  VolunteerNotificationId,
} from '../domain/branded-ids';
import type {
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
  DashboardAvailabilityTask,
  IVolunteerManager,
  MinistrySchedule,
  NotificationListResult,
  RespondToAssignmentInput,
  UpsertAvailabilityInput,
  VolunteerContext,
  VolunteerDashboard,
} from '../domain/contracts/application/volunteer-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { TeamRepository } from '../domain/contracts/infrastructure/team.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { VolunteerNotificationRepository } from '../domain/contracts/infrastructure/volunteer-notification.repository';
import type {
  Assignment,
  AssignmentStatus,
} from '../domain/entities/assignment';
import type { Availability } from '../domain/entities/availability';
import type { TimeSlot } from '../domain/entities/time-slot';
import { IsolationBreachError } from '../domain/errors/isolation-breach-error';

const UPCOMING_DAYS = 30;
const DEFAULT_NOTIFICATION_LIMIT = 20;
const NOTIFICATION_PREVIEW_LIMIT = 3;

const ADMINISTRATION_MINISTRY_NAME = 'Administration';

function slotKey(startTime: Date, endTime: Date): string {
  return `${startTime.toISOString()}::${endTime.toISOString()}`;
}

function availabilityCompletionState(
  entries: Availability[],
  slots: TimeSlot[],
): 'missing' | 'partial' | 'complete' {
  if (slots.length === 0) return 'missing';
  const matchingKeys = new Set(
    entries.map((e) => slotKey(e.startTime, e.endTime)),
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

function scheduleSlotLabel(slot: TimeSlot): string {
  return (
    slot.label ??
    `${slot.startTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${slot.endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
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
    @inject('ITimeSlotRepository')
    private readonly timeSlotRepo: TimeSlotRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepo: MinistryRepository,
    @inject('IRoleRepository')
    private readonly roleRepo: RoleRepository,
    @inject('ITeamRepository')
    private readonly teamRepo: TeamRepository,
  ) {}

  async resolveVolunteerContext(
    userId: UserId,
  ): Promise<VolunteerContext | null> {
    const volunteer = await this.volunteerRepo.findByUserIdGlobally(userId);
    if (!volunteer) return null;
    const ledMinistries = await this.volunteerRepo.listLedMinistries(
      volunteer.churchId,
      volunteer.id,
    );
    return {
      volunteerId: volunteer.id,
      churchId: volunteer.churchId,
      isAdmin: ledMinistries.some(
        (m) => m.ministryName === ADMINISTRATION_MINISTRY_NAME,
      ),
      isLeader: ledMinistries.length > 0,
    };
  }

  async getDashboard(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<VolunteerDashboard> {
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
    const allAssignments = await this.assignmentRepo.listByVolunteer(
      churchId,
      volunteerId,
    );

    const groupMap = new Map<
      string,
      {
        eventId: string;
        eventTitle: string;
        ministryId: string;
        ministryName: string;
        eventStart: string;
        items: DashboardAssignmentItem[];
      }
    >();

    for (const assignment of allAssignments) {
      if (!isPublishedStatus(assignment.status)) continue;

      const slot = await this.timeSlotRepo.getById(churchId, assignment.slotId);
      const event = await this.eventRepo.getById(churchId, slot.eventId);

      if (event.status !== 'published' || slot.endTime <= now) continue;

      const ministry = ministryById.get(event.ministryId as string);
      if (!ministry) continue;

      const role = await this.roleRepo.getById(churchId, assignment.roleId);
      const timingState: 'in_progress' | 'upcoming' =
        slot.startTime <= now ? 'in_progress' : 'upcoming';

      const item: DashboardAssignmentItem = {
        assignmentId: assignment.id as string,
        slotId: slot.id as string,
        roleId: assignment.roleId as string,
        roleName: role.name,
        startTime: slot.startTime.toISOString(),
        endTime: slot.endTime.toISOString(),
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
          ministryId: event.ministryId as string,
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

  async getUpcomingAssignments(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<Assignment[]> {
    const { volunteerId, churchId } = input;
    const now = new Date();
    const future = new Date(
      now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000,
    );
    return this.assignmentRepo.listByVolunteerInRange(
      churchId,
      volunteerId,
      now,
      future,
    );
  }

  async getMinistrySchedule(input: {
    ministryId: MinistryId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<MinistrySchedule> {
    const { churchId, ministryId, volunteerId } = input;

    const memberMinistryIds = await this.volunteerRepo.listMemberMinistryIds(
      churchId,
      volunteerId,
    );
    if (!memberMinistryIds.includes(ministryId)) {
      throw new IsolationBreachError();
    }

    const [ministry, ministryEvents, roles, memberships] = await Promise.all([
      this.ministryRepo.getById(churchId, ministryId),
      this.eventRepo.listByMinistry(churchId, ministryId, 'published'),
      this.roleRepo.listByMinistry(churchId, ministryId),
      this.volunteerRepo.listMinistryMemberships(churchId, ministryId),
    ]);
    const eventData = await Promise.all(
      ministryEvents.map(async (event) => ({
        event,
        slots: await this.timeSlotRepo.listByEvent(churchId, event.id),
        assignments: await this.assignmentRepo.listByEvent(churchId, event.id),
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
          item.slots.flatMap((slot) =>
            slot.requirements.flatMap((requirement) =>
              requirement.teamId ? [requirement.teamId] : [],
            ),
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
        ({ event, slots, assignments: eventAssignments }) => {
          const activeAssignments = eventAssignments.filter((assignment) =>
            isPublishedStatus(assignment.status),
          );
          const rows = slots.flatMap((slot) => {
            const slotAssignments = activeAssignments.filter(
              (assignment) => assignment.slotId === slot.id,
            );
            const assignmentRows = slotAssignments.map((assignment) => {
              const requirement = slot.requirements.find(
                (item) => item.roleId === assignment.roleId,
              );
              const teamId =
                requirement?.teamId ??
                membershipTeams.get(assignment.volunteerId as string);
              return {
                slotId: slot.id as string,
                slotLabel: scheduleSlotLabel(slot),
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
            const openRows = slot.requirements.flatMap((requirement) => {
              const assignedCount = slotAssignments.filter(
                (assignment) => assignment.roleId === requirement.roleId,
              ).length;
              return Array.from(
                {
                  length: Math.max(
                    0,
                    requirement.requiredCount - assignedCount,
                  ),
                },
                () => ({
                  slotId: slot.id as string,
                  slotLabel: scheduleSlotLabel(slot),
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

  async upsertAvailability(
    input: UpsertAvailabilityInput,
  ): Promise<Availability> {
    const {
      churchId,
      availabilityId,
      volunteerId,
      eventId,
      type,
      startTime,
      endTime,
      isAllDay,
      reason,
      repeatRule,
    } = input;
    if (availabilityId) {
      await this.availabilityRepo.update(churchId, availabilityId, {
        eventId,
        type,
        startTime,
        endTime,
        isAllDay,
        reason,
        repeatRule,
      });
      return this.availabilityRepo.getById(churchId, availabilityId);
    }
    return this.availabilityRepo.create(churchId, {
      volunteerId,
      eventId,
      type,
      startTime,
      endTime,
      isAllDay,
      reason,
      repeatRule,
    });
  }

  async deleteAvailability(input: {
    availabilityId: AvailabilityId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void> {
    const { availabilityId, volunteerId, churchId } = input;
    const existing = await this.availabilityRepo.getById(
      churchId,
      availabilityId,
    );
    if ((existing.volunteerId as string) !== (volunteerId as string)) {
      throw new IsolationBreachError(
        'Isolation breach: availability does not belong to the requesting volunteer',
      );
    }
    return this.availabilityRepo.delete(churchId, availabilityId);
  }

  async getAvailability(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
    startTime?: Date;
    endTime?: Date;
  }): Promise<Availability[]> {
    const { volunteerId, churchId, startTime, endTime } = input;
    const start = startTime ?? new Date(0);
    const end = endTime ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    return this.availabilityRepo.listByVolunteerInRange(
      churchId,
      volunteerId,
      start,
      end,
    );
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

  async getNotifications(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
    cursor?: Date;
    limit?: number;
  }): Promise<NotificationListResult> {
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

  async markNotificationRead(input: {
    notificationId: VolunteerNotificationId;
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void> {
    const { notificationId, volunteerId, churchId } = input;
    await this.notificationRepo.markRead(churchId, volunteerId, notificationId);
  }

  async markAllNotificationsRead(input: {
    volunteerId: VolunteerId;
    churchId: ChurchId;
  }): Promise<void> {
    await this.notificationRepo.markAllRead(input.churchId, input.volunteerId);
  }
}
