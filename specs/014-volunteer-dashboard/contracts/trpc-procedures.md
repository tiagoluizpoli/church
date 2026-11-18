# tRPC Procedure Contracts: Volunteer Dashboard

**Branch**: `develop` | **Date**: 2026-06-29

All procedures live under `volunteerRouter` (`trpc.volunteer.*`).
All procedures are `protectedProcedure`.
All procedures resolve the current volunteer from session user identity and enforce `churchId` isolation.

---

## Existing Procedure

```typescript
trpc.volunteer.respondToAssignment.useMutation()
// Input:
{
  assignmentId: string;
  response: 'confirmed' | 'declined';
}
// Returns:
{
  success: true;
  status: 'confirmed' | 'declined';
  undoExpiresAt?: string;
}
// Rules:
// - only own assignment
// - reject if assignment already in progress
// - allow confirmed -> declined before Event start
```

---

## New Procedures

### Dashboard Snapshot

```typescript
trpc.volunteer.getVolunteerDashboard.useQuery()
// Returns:
{
  availabilityTasks: Array<{
    eventId: string;
    eventTitle: string;
    ministryId: string;
    ministryName: string;
    eventType: 'hourly' | 'day_based';
    eventStart: string;
    eventEnd: string;
    completionState: 'missing' | 'partial' | 'complete';
  }>;
  upcomingAssignmentGroups: Array<{
    eventId: string;
    eventTitle: string;
    ministryId: string;
    ministryName: string;
    eventStart: string;
    aggregateResponseState: 'pending' | 'confirmed' | 'mixed' | 'declined';
    hasPendingResponse: boolean;
    assignments: Array<{
      assignmentId: string;
      slotId: string;
      roleId: string;
      roleName: string;
      teamId?: string;
      teamName?: string;
      startTime: string;
      endTime: string;
      status: 'pending' | 'confirmed' | 'declined';
      timingState: 'in_progress' | 'upcoming';
      canRespond: boolean;
    }>;
  }>;
  notificationUnreadCount: number;
  notificationPreview: Array<{
    id: string;
    type: VolunteerNotificationType;
    title: string;
    body: string;
    readAt?: string;
    createdAt: string;
  }>;
  defaultMinistryId?: string;
  ministryOptions: Array<{ id: string; name: string }>;
  fetchedAt: string;
}
```

### Event Availability

```typescript
trpc.volunteer.getMyAvailability.useQuery({
  eventId?: string;
})
// Returns:
Array<{
  id: string;
  eventId?: string;
  type: 'available' | 'unavailable';
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  reason?: string;
}>

trpc.volunteer.upsertAvailability.useMutation()
// Input:
{
  id?: string;
  eventId: string;
  entries: Array<{
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    reason?: string;
    type?: 'unavailable';
  }>;
  confirmOverlap?: boolean;
}
// Returns:
{
  success: true;
  savedEntryIds: string[];
  completionState: 'partial' | 'complete';
  overlapWarning?: {
    requiresConfirmation: boolean;
    conflictingAssignmentIds: string[];
    message: string;
  };
}
// Error:
// - 400 invalid date bounds
// - 409 overlap blocked by rollout flag without confirmation path

trpc.volunteer.deleteAvailability.useMutation()
// Input:
{
  id: string;
}
// Returns:
{
  success: true;
}
```

### Notifications Inbox

```typescript
trpc.volunteer.getMyNotifications.useInfiniteQuery({
  cursor?: string;
  limit?: number;
})
// Returns:
{
  items: Array<{
    id: string;
    type: VolunteerNotificationType;
    title: string;
    body: string;
    readAt?: string;
    createdAt: string;
    deepLink: {
      section: 'availability' | 'assignments' | 'notifications' | 'ministry_schedule';
      eventId?: string;
      assignmentId?: string;
      ministryId?: string;
    };
  }>;
  nextCursor?: string;
}

trpc.volunteer.markNotificationRead.useMutation()
// Input: { notificationId: string }
// Returns: { success: true, readAt: string }

trpc.volunteer.markAllNotificationsRead.useMutation()
// Input: {}
// Returns: { success: true, updatedCount: number }
```

### Ministry Schedule

```typescript
trpc.volunteer.getMinistrySchedule.useQuery({
  ministryId: string;
})
// Returns:
{
  ministryId: string;
  ministryName: string;
  events: Array<{
    eventId: string;
    title: string;
    startDate: string;
    endDate: string;
    assignmentCount: number;
    rows: Array<{
      slotId: string;
      slotLabel: string;
      roleName: string;
      teamName?: string;
      volunteerDisplayName?: string;
      confirmationState: 'pending' | 'confirmed' | 'declined' | 'open';
    }>;
  }>;
}
```

---

## Notes

- `getMyUpcomingAssignments` may still exist as a focused query if implementation prefers separate invalidation boundaries, but `getVolunteerDashboard` remains canonical first-load query
- background refresh and offline caching are client behaviors on top of these contracts, not separate procedures
