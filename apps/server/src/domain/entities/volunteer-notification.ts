import { Entity, type LooseProps } from '@church/core';
import type {
  AssignmentId,
  ChurchId,
  EventId,
  MinistryId,
  PlanningCycleId,
  VolunteerId,
  VolunteerNotificationId,
} from '../branded-ids';

export const VOLUNTEER_NOTIFICATION_TYPE_OPTIONS = [
  'schedule_published',
  'assignment_added',
  'assignment_changed',
  'assignment_removed',
  'availability_reminder',
  'assignment_reminder',
] as const;
export type VolunteerNotificationType =
  (typeof VOLUNTEER_NOTIFICATION_TYPE_OPTIONS)[number];

export type VolunteerNotificationPayload = Record<string, string | null> & {
  assignmentId?: string | null;
  eventId?: string | null;
  ministryId?: string | null;
  section?: string | null;
};

export interface VolunteerNotificationProps {
  churchId: ChurchId;
  volunteerId: VolunteerId;
  planningCycleId?: PlanningCycleId;
  ministryId?: MinistryId;
  eventId?: EventId;
  assignmentId?: AssignmentId;
  type: VolunteerNotificationType;
  title: string;
  body: string;
  payload: VolunteerNotificationPayload;
  readAt?: Date;
  createdAt: Date;
}

type VolunteerNotificationConstructorProps = Omit<
  LooseProps<VolunteerNotificationProps>,
  'createdAt'
> &
  Partial<Pick<LooseProps<VolunteerNotificationProps>, 'createdAt'>>;

export class VolunteerNotification extends Entity<
  VolunteerNotificationProps,
  VolunteerNotificationId
> {
  constructor(
    props: VolunteerNotificationConstructorProps,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        createdAt: props.createdAt ?? new Date(),
      } as VolunteerNotificationProps,
      id as VolunteerNotificationId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get volunteerId(): VolunteerId {
    return this._props.volunteerId;
  }

  get planningCycleId(): PlanningCycleId | undefined {
    return this._props.planningCycleId;
  }

  get ministryId(): MinistryId | undefined {
    return this._props.ministryId;
  }

  get eventId(): EventId | undefined {
    return this._props.eventId;
  }

  get assignmentId(): AssignmentId | undefined {
    return this._props.assignmentId;
  }

  get type(): VolunteerNotificationType {
    return this._props.type;
  }

  get title(): string {
    return this._props.title;
  }

  get body(): string {
    return this._props.body;
  }

  get payload(): VolunteerNotificationPayload {
    return this._props.payload;
  }

  get readAt(): Date | undefined {
    return this._props.readAt;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }
}
