import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import { AssignmentManagerService } from '../domain/assignment/assignment-manager-service';
import type {
  CancelEventInput,
  CreateSlotInput,
  DeleteSlotInput,
  GenerateSlotsInput,
  GetScheduleBuilderDataInput,
  IEventManager,
  ListEventsInput,
  ScheduleBuilderData,
  SendReminderInput,
  UpdateSlotInput,
  UpsertSlotRequirementInput,
} from '../domain/contracts/application/event-manager';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityRepository } from '../domain/contracts/infrastructure/availability.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { NotificationService } from '../domain/contracts/infrastructure/notification-service';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import type { Event } from '../domain/entities/event';
import type { SlotRequirement } from '../domain/entities/slot-requirement';
import type { TimeSlot } from '../domain/entities/time-slot';
import { IsolationBreachError } from '../domain/errors/isolation-breach-error';

@injectable()
export class DbEventManager implements IEventManager {
  constructor(
    @inject('IEventRepository')
    private readonly eventRepo: EventRepository,
    @inject('ITimeSlotRepository')
    private readonly slotRepo: TimeSlotRepository,
    @inject('IAssignmentRepository')
    private readonly assignmentRepo: AssignmentRepository,
    @inject('IAvailabilityRepository')
    private readonly availabilityRepo: AvailabilityRepository,
    @inject('IVolunteerRepository')
    private readonly volunteerRepo: VolunteerRepository,
    @inject('IRoleRepository')
    private readonly roleRepo: RoleRepository,
    @inject('INotificationService')
    private readonly notificationService: NotificationService,
  ) {}

  async getScheduleBuilderData(
    input: GetScheduleBuilderDataInput,
  ): Promise<ScheduleBuilderData> {
    const { churchId, eventId, volunteerId } = input;
    const event = await this.eventRepo.getById(churchId, eventId);
    const ministryId =
      input.ministryId ??
      (await this.eventRepo.getMinistryId(churchId, eventId));

    const memberships = await this.volunteerRepo.listMinistryMemberships(
      churchId,
      ministryId,
    );
    const callerMembership = memberships.find(
      (membership) => membership.volunteerId === volunteerId,
    );
    if (!callerMembership) {
      throw new IsolationBreachError(
        'Volunteer does not belong to the event ministry',
      );
    }
    const isCallerMinistryLeader =
      callerMembership.ministryAccessLevel === 'leader';
    const callerLedTeamIds = new Set(
      callerMembership.teamMemberships
        .filter((membership) => membership.accessLevel === 'leader')
        .map((membership) => membership.teamId),
    );
    if (!isCallerMinistryLeader && callerLedTeamIds.size === 0) {
      throw new IsolationBreachError(
        'Volunteer does not have leader or TeamLeader privileges',
      );
    }
    /**
     * TeamLeader-ness is per-team (`ministry_volunteer_team.access_level =
     * 'leader'`), orthogonal to the ministry-wide `ministryAccessLevel` — a
     * caller can be an ordinary Ministry Member and still lead one or more
     * Teams (CONTEXT.md's TeamLeader, the direct replacement for the old
     * ministry-wide `sub_leader` flag). Such a caller is scoped to the teams
     * they actually lead, not every team they merely belong to, which is
     * strictly narrower than the old flat `teamIds` scoping. A ministry
     * leader stays unrestricted.
     */
    const callerTeamIds = isCallerMinistryLeader ? null : callerLedTeamIds;

    const [slots, rawAssignments, ministryVolunteers, roles] =
      await Promise.all([
        this.slotRepo.listByEvent(churchId, eventId),
        this.assignmentRepo.listByEvent(churchId, eventId),
        this.volunteerRepo.listByMinistry(churchId, ministryId),
        this.roleRepo.listByMinistry(churchId, ministryId),
      ]);
    const allowedVolunteerIds = new Set(
      memberships
        .filter(
          (membership) =>
            callerTeamIds == null ||
            membership.teamMemberships.some((team) =>
              callerTeamIds.has(team.teamId),
            ),
        )
        .map((membership) => membership.volunteerId),
    );
    const rawVolunteers = ministryVolunteers.filter((volunteer) =>
      allowedVolunteerIds.has(volunteer.id),
    );
    const membershipByVolunteerId = new Map(
      memberships.map((membership) => [membership.volunteerId, membership]),
    );

    const allVolunteerIds = rawVolunteers.map((v) => v.id);
    const rawAvailability =
      allVolunteerIds.length > 0
        ? await this.availabilityRepo.listByVolunteers(
            churchId,
            allVolunteerIds,
          )
        : [];

    return {
      events: [{ event, slots }],
      assignments: rawAssignments,
      availability: rawAvailability,
      volunteers: rawVolunteers.map((v) => {
        const membership = membershipByVolunteerId.get(v.id);
        /**
         * Narrowed to the caller's own scope. A TeamLeader caller already only
         * sees members who share a led team with them, but a member may also
         * belong to teams outside that scope — those memberships must not
         * travel in the payload.
         */
        const teamMemberships = (membership?.teamMemberships ?? []).filter(
          (team) => callerTeamIds == null || callerTeamIds.has(team.teamId),
        );
        return {
          id: v.id,
          name: (v.name ?? v.id) as string,
          ministryAccessLevel: membership?.ministryAccessLevel ?? 'volunteer',
          qualifiedRoleIds: membership?.qualifiedRoleIds ?? [],
          teamIds: teamMemberships.map((team) => team.teamId),
          leadTeamIds: teamMemberships
            .filter((team) => team.accessLevel === 'leader')
            .map((team) => team.teamId),
        };
      }),
      roles: roles.map((role) => ({ id: role.id, name: role.name })),
      callerTeamIds: callerTeamIds == null ? null : [...callerTeamIds],
    };
  }

  async listEvents(input: ListEventsInput): Promise<Event[]> {
    return this.eventRepo.listByMinistry(
      input.churchId,
      input.ministryId,
      input.status,
    );
  }

  async cancelEvent(input: CancelEventInput): Promise<void> {
    const { eventId, churchId } = input;
    await this.eventRepo.updateStatus(churchId, eventId, {
      status: 'cancelled',
    });
  }

  async createSlot(input: CreateSlotInput): Promise<TimeSlot> {
    const { churchId, eventId, startTime, endTime, label } = input;
    return this.slotRepo.create(churchId, {
      eventId,
      startTime,
      endTime,
      label,
    });
  }

  async updateSlot(input: UpdateSlotInput): Promise<TimeSlot> {
    const { churchId, slotId, startTime, endTime, label } = input;
    return this.slotRepo.update(churchId, slotId, {
      startTime,
      endTime,
      label,
    });
  }

  async deleteSlot(input: DeleteSlotInput): Promise<void> {
    return this.slotRepo.deleteById(input.churchId, input.slotId);
  }

  async generateSlots(input: GenerateSlotsInput): Promise<TimeSlot[]> {
    const { churchId, eventId, strategy } = input;
    const ev = await this.eventRepo.getById(churchId, eventId);
    const existingSlots = await this.slotRepo.listByEvent(churchId, eventId);

    const result = AssignmentManagerService.generateSlots({
      churchId: churchId as string,
      eventId: eventId as string,
      eventStartTime: ev.startDate,
      eventEndTime: ev.endDate,
      strategy,
      existingSlots,
    });

    const bulkItems = result.slots.map(({ slot, requirements }) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label,
      requirements: requirements.map((r) => ({
        roleId: r.roleId,
        teamId: r.teamId,
        requiredCount: r.requiredCount,
        notes: r.notes,
      })),
    }));

    return this.slotRepo.bulkCreate(churchId, { eventId, slots: bulkItems });
  }

  async upsertSlotRequirement(
    input: UpsertSlotRequirementInput,
  ): Promise<SlotRequirement> {
    const { churchId, slotId, roleId, teamId, requiredCount, notes } = input;
    return this.slotRepo.upsertRequirement(churchId, slotId, {
      roleId,
      teamId,
      requiredCount,
      notes,
    });
  }

  async sendReminder(input: SendReminderInput): Promise<void> {
    const { eventId, churchId } = input;
    await this.eventRepo.getById(churchId, eventId);
    const ministryId = await this.eventRepo.getMinistryId(churchId, eventId);
    const volunteers = await this.volunteerRepo.listByMinistry(
      churchId,
      ministryId,
    );
    await Promise.all(
      volunteers.map((vol) =>
        this.notificationService.notifyReminder({
          churchId: churchId as string,
          eventId: eventId as string,
          volunteerId: vol.id as string,
        }),
      ),
    );
  }
}
