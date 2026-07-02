import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import { AssignmentManagerService } from '../domain/assignment/assignment-manager-service';
import type {
  CreateEventInput,
  CreateSlotInput,
  GenerateSlotsInput,
  IEventManager,
  ListEventsInput,
  ScheduleBuilderData,
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
import type { ChurchId } from '../domain/entities/church';
import {
  Event as DomainEvent,
  type Event,
  type EventId,
} from '../domain/entities/event';
import type { SlotRequirement } from '../domain/entities/slot-requirement';
import type { TimeSlot, TimeSlotId } from '../domain/entities/time-slot';
import type { VolunteerId } from '../domain/entities/volunteer';
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

  async getScheduleBuilderData(input: {
    churchId: ChurchId;
    eventId: EventId;
    volunteerId: VolunteerId;
  }): Promise<ScheduleBuilderData> {
    const { churchId, eventId, volunteerId } = input;
    const event = await this.eventRepo.getById(churchId, eventId);
    const ministryId = event.ministryId;

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
    if (callerMembership.systemRole === 'volunteer') {
      throw new IsolationBreachError(
        'Volunteer does not have leader or sub-leader privileges',
      );
    }
    const callerTeamId =
      callerMembership.systemRole === 'sub_leader'
        ? callerMembership.teamId
        : null;

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
            callerTeamId == null || membership.teamId === callerTeamId,
        )
        .map((membership) => membership.volunteerId),
    );
    const rawVolunteers = ministryVolunteers.filter((volunteer) =>
      allowedVolunteerIds.has(volunteer.id),
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
      volunteers: rawVolunteers.map((v) => ({
        id: v.id,
        name: (v.name ?? v.id) as string,
      })),
      roles: roles.map((role) => ({ id: role.id, name: role.name })),
      callerTeamId,
    };
  }

  async createEvent(input: CreateEventInput): Promise<Event> {
    const {
      churchId,
      ministryId,
      title,
      description,
      location,
      startDate,
      endDate,
      eventType,
    } = input;
    // Validate via domain entity constructor (throws InvalidDateRangeError)
    new DomainEvent({
      churchId,
      ministryId,
      title,
      description,
      location,
      startDate,
      endDate,
      status: 'draft',
      eventType: eventType ?? 'hourly',
    });
    return this.eventRepo.create(churchId, {
      ministryId,
      title,
      description,
      location,
      startDate,
      endDate,
      eventType,
    });
  }

  async listEvents(input: ListEventsInput): Promise<Event[]> {
    return this.eventRepo.listByMinistry(
      input.churchId,
      input.ministryId,
      input.status,
    );
  }

  async publishEvent(input: {
    eventId: EventId;
    churchId: ChurchId;
  }): Promise<void> {
    const { eventId, churchId } = input;
    await this.eventRepo.updateStatus(churchId, eventId, {
      status: 'published',
    });
  }

  async cancelEvent(input: {
    eventId: EventId;
    churchId: ChurchId;
  }): Promise<void> {
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

  async deleteSlot(input: {
    slotId: TimeSlotId;
    churchId: ChurchId;
  }): Promise<void> {
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

  async sendReminder(input: {
    eventId: EventId;
    churchId: ChurchId;
  }): Promise<void> {
    const { eventId, churchId } = input;
    const ev = await this.eventRepo.getById(churchId, eventId);
    const volunteers = await this.volunteerRepo.listByMinistry(
      churchId,
      ev.ministryId,
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
