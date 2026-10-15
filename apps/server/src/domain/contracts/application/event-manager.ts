import type {
  ChurchId,
  EventId,
  MinistryId,
  RoleId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { Event, EventStatus } from '../../entities/event';
import type { EventTimeBlock } from '../../entities/event-time-block';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { Availability } from '../../entities/unavailable-shift';

export interface ListEventsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  status?: EventStatus;
}

export interface ScheduleBuilderEventGroup {
  event: Event;
  slots: EventTimeBlock[];
}

export interface ScheduleBuilderVolunteerOption {
  id: VolunteerId;
  name: string;
  /** This member's ministry-wide access level. Independent of team leadership. */
  ministryAccessLevel: MinistryAccessLevel;
  /** Roles this member is qualified to fill, including global roles. */
  qualifiedRoleIds: string[];
  /** Every team this member belongs to within the ministry. Flat, no primary. */
  teamIds: string[];
  /** Subset of `teamIds` this member leads (TeamLeader — per-team, not ministry-wide). */
  leadTeamIds: string[];
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
  /**
   * Teams the calling TeamLeader may schedule for, or `null` when the caller
   * is a ministry leader and therefore unrestricted. A TeamLeader can lead
   * more than one team, so this is a list.
   */
  callerTeamIds: string[] | null;
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

export interface IEventManager {
  getScheduleBuilderData(
    input: GetScheduleBuilderDataInput,
  ): Promise<ScheduleBuilderData>;
  listEvents(input: ListEventsInput): Promise<Event[]>;
}
