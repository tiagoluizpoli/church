import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  SectorId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Event, EventStatus } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { UnavailableShift } from '../../entities/unavailable-shift';

export interface ListEventsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  status?: EventStatus;
}

export interface ScheduleBuilderEventGroup {
  event: Event;
  eventTimeBlocks: EventTimeBlock[];
}

export interface ScheduleBuilderVolunteerOption {
  id: VolunteerId;
  name: string;
  /** This member's ministry-wide access level. */
  ministryAccessLevel: MinistryAccessLevel;
  /** Roles this member is qualified to fill, including global roles. */
  qualifiedRoleIds: string[];
}

export interface ScheduleBuilderRoleOption {
  id: RoleId;
  name: string;
}

export interface ScheduleBuilderSectorOption {
  id: SectorId;
  name: string;
}

export interface ScheduleBuilderData {
  events: ScheduleBuilderEventGroup[];
  assignments: Assignment[];
  unavailableShifts: UnavailableShift[];
  volunteers: ScheduleBuilderVolunteerOption[];
  roles: ScheduleBuilderRoleOption[];
  /** The Ministry's Sectors, ordered by name. */
  sectors: ScheduleBuilderSectorOption[];
}

export interface GetScheduleBuilderDataInput {
  churchId: ChurchId;
  eventId: EventId;
  userId: UserId;
  /**
   * Disambiguates which ministry's slice to build when the event has more
   * than one MinistryParticipation (the normal case post-017: a church-owned
   * Event can be shared by several ministries). Falls back to the legacy
   * single-ministry-per-event lookup when omitted.
   */
  ministryId?: MinistryId;
}

export interface IEventManager {
  getScheduleBuilderData(
    input: GetScheduleBuilderDataInput,
  ): Promise<ScheduleBuilderData>;
  listEvents(input: ListEventsInput): Promise<Event[]>;
}
