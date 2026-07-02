import type { Assignment } from '../../entities/assignment';
import type { Availability } from '../../entities/availability';
import type { ChurchId } from '../../entities/church';
import type {
  Event,
  EventId,
  EventStatus,
  EventType,
} from '../../entities/event';
import type { MinistryId } from '../../entities/ministry';
import type { RoleId } from '../../entities/role';
import type { SlotRequirement } from '../../entities/slot-requirement';
import type { TeamId } from '../../entities/team';
import type { TimeSlot, TimeSlotId } from '../../entities/time-slot';
import type { VolunteerId } from '../../entities/volunteer';

export interface CreateEventInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  eventType?: EventType;
}

export interface ListEventsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  status?: EventStatus;
}

export interface CreateSlotInput {
  churchId: ChurchId;
  eventId: EventId;
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface UpdateSlotInput {
  churchId: ChurchId;
  slotId: TimeSlotId;
  startTime?: Date;
  endTime?: Date;
  label?: string;
}

export interface GenerateSlotsEqualSplit {
  kind: 'equal-split';
  slotDurationMinutes: number;
}

export interface GenerateSlotsTemplateBased {
  kind: 'template-based';
  periods: Array<{
    label: string;
    startTime: Date;
    endTime: Date;
    requirements?: Array<{
      roleId: string;
      teamId?: string;
      requiredCount: number;
      notes?: string;
    }>;
  }>;
}

export interface GenerateSlotsInput {
  churchId: ChurchId;
  eventId: EventId;
  strategy: GenerateSlotsEqualSplit | GenerateSlotsTemplateBased;
}

export interface UpsertSlotRequirementInput {
  churchId: ChurchId;
  slotId: TimeSlotId;
  roleId: RoleId;
  teamId?: TeamId;
  requiredCount: number;
  notes?: string;
}

export interface ScheduleBuilderData {
  events: Array<{
    event: Event;
    slots: TimeSlot[];
  }>;
  assignments: Assignment[];
  availability: Availability[];
  volunteers: Array<{ id: VolunteerId; name: string }>;
  roles: Array<{ id: RoleId; name: string }>;
  callerTeamId: string | null;
}

export interface IEventManager {
  getScheduleBuilderData(input: {
    churchId: ChurchId;
    eventId: EventId;
    volunteerId: VolunteerId;
  }): Promise<ScheduleBuilderData>;
  createEvent(input: CreateEventInput): Promise<Event>;
  listEvents(input: ListEventsInput): Promise<Event[]>;
  publishEvent(input: { eventId: EventId; churchId: ChurchId }): Promise<void>;
  cancelEvent(input: { eventId: EventId; churchId: ChurchId }): Promise<void>;
  createSlot(input: CreateSlotInput): Promise<TimeSlot>;
  updateSlot(input: UpdateSlotInput): Promise<TimeSlot>;
  deleteSlot(input: { slotId: TimeSlotId; churchId: ChurchId }): Promise<void>;
  generateSlots(input: GenerateSlotsInput): Promise<TimeSlot[]>;
  upsertSlotRequirement(
    input: UpsertSlotRequirementInput,
  ): Promise<SlotRequirement>;
  sendReminder(input: { eventId: EventId; churchId: ChurchId }): Promise<void>;
}
