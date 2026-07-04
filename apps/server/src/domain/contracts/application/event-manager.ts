import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  TeamId,
  TimeSlotId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Availability } from '../../entities/availability';
import type { Event, EventStatus } from '../../entities/event';
import type { SlotRequirement } from '../../entities/slot-requirement';
import type { TimeSlot } from '../../entities/time-slot';

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
  periods: GenerateSlotsTemplatePeriod[];
}

export interface GenerateSlotsInput {
  churchId: ChurchId;
  eventId: EventId;
  strategy: GenerateSlotsEqualSplit | GenerateSlotsTemplateBased;
}

export interface GenerateSlotsTemplateRequirement {
  roleId: string;
  teamId?: string;
  requiredCount: number;
  notes?: string;
}

export interface GenerateSlotsTemplatePeriod {
  label: string;
  startTime: Date;
  endTime: Date;
  requirements?: GenerateSlotsTemplateRequirement[];
}

export interface UpsertSlotRequirementInput {
  churchId: ChurchId;
  slotId: TimeSlotId;
  roleId: RoleId;
  teamId?: TeamId;
  requiredCount: number;
  notes?: string;
}

export interface ScheduleBuilderEventGroup {
  event: Event;
  slots: TimeSlot[];
}

export interface ScheduleBuilderVolunteerOption {
  id: VolunteerId;
  name: string;
}

export interface ScheduleBuilderRoleOption {
  id: RoleId;
  name: string;
}

export interface ScheduleBuilderData {
  events: ScheduleBuilderEventGroup[];
  assignments: Assignment[];
  availability: Availability[];
  volunteers: ScheduleBuilderVolunteerOption[];
  roles: ScheduleBuilderRoleOption[];
  callerTeamId: string | null;
}

export interface GetScheduleBuilderDataInput {
  churchId: ChurchId;
  eventId: EventId;
  volunteerId: VolunteerId;
  /**
   * Disambiguates which ministry's slice to build when the event has more
   * than one MinistryParticipation (the normal case post-017: a church-owned
   * Event can be shared by several ministries). Falls back to the legacy
   * single-ministry-per-event lookup when omitted.
   */
  ministryId?: MinistryId;
}

export interface CancelEventInput {
  eventId: EventId;
  churchId: ChurchId;
}

export interface DeleteSlotInput {
  slotId: TimeSlotId;
  churchId: ChurchId;
}

export interface SendReminderInput {
  eventId: EventId;
  churchId: ChurchId;
}

export interface IEventManager {
  getScheduleBuilderData(
    input: GetScheduleBuilderDataInput,
  ): Promise<ScheduleBuilderData>;
  listEvents(input: ListEventsInput): Promise<Event[]>;
  cancelEvent(input: CancelEventInput): Promise<void>;
  createSlot(input: CreateSlotInput): Promise<TimeSlot>;
  updateSlot(input: UpdateSlotInput): Promise<TimeSlot>;
  deleteSlot(input: DeleteSlotInput): Promise<void>;
  generateSlots(input: GenerateSlotsInput): Promise<TimeSlot[]>;
  upsertSlotRequirement(
    input: UpsertSlotRequirementInput,
  ): Promise<SlotRequirement>;
  sendReminder(input: SendReminderInput): Promise<void>;
}
