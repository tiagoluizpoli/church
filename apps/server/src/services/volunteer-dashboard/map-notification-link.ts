export interface NotificationDeepLink {
  section:
    | 'availability'
    | 'assignments'
    | 'notifications'
    | 'ministry_schedule';
  eventId?: string;
  assignmentId?: string;
  ministryId?: string;
}

export interface NotificationLinkContext {
  availabilityEventIds: string[];
  assignmentEventIds: string[];
  ministryIds: string[];
}

export interface MapNotificationLinkInput {
  payload: Record<string, string | null>;
  currentContext?: NotificationLinkContext;
}

export function mapNotificationLink(
  input: MapNotificationLinkInput,
): NotificationDeepLink {
  const section = input.payload.section;
  const deepLink: NotificationDeepLink = {
    section:
      section === 'availability' ||
      section === 'assignments' ||
      section === 'ministry_schedule'
        ? section
        : 'notifications',
    eventId: input.payload.eventId ?? undefined,
    assignmentId: input.payload.assignmentId ?? undefined,
    ministryId: input.payload.ministryId ?? undefined,
  };

  if (!input.currentContext) {
    return deepLink;
  }

  if (
    deepLink.section === 'availability' &&
    deepLink.eventId &&
    input.currentContext.availabilityEventIds.includes(deepLink.eventId)
  ) {
    return deepLink;
  }

  if (
    deepLink.section === 'assignments' &&
    deepLink.eventId &&
    input.currentContext.assignmentEventIds.includes(deepLink.eventId)
  ) {
    return deepLink;
  }

  if (
    deepLink.section === 'ministry_schedule' &&
    deepLink.ministryId &&
    input.currentContext.ministryIds.includes(deepLink.ministryId)
  ) {
    return deepLink;
  }

  if (
    deepLink.eventId &&
    input.currentContext.availabilityEventIds.includes(deepLink.eventId)
  ) {
    return {
      section: 'availability',
      eventId: deepLink.eventId,
    };
  }

  if (
    deepLink.eventId &&
    input.currentContext.assignmentEventIds.includes(deepLink.eventId)
  ) {
    return {
      section: 'assignments',
      eventId: deepLink.eventId,
      assignmentId: deepLink.assignmentId,
    };
  }

  if (
    deepLink.ministryId &&
    input.currentContext.ministryIds.includes(deepLink.ministryId)
  ) {
    return {
      section: 'ministry_schedule',
      ministryId: deepLink.ministryId,
    };
  }

  return {
    section: 'notifications',
  };
}
