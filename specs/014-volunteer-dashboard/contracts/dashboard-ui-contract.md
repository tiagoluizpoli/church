# Dashboard UI Contract: Volunteer Dashboard

**Branch**: `develop` | **Date**: 2026-06-29

This file defines the major UI boundaries and state contracts between the dashboard container and its sections.

---

## `<VolunteerDashboard>`

Top-level container for `/dashboard`.

```typescript
interface VolunteerDashboardProps {
  initialSection?: 'availability' | 'assignments' | 'notifications' | 'ministry_schedule';
  initialEventId?: string;
  initialAssignmentId?: string;
  initialMinistryId?: string;
}
```

Responsibilities:
- load initial dashboard snapshot
- coordinate whole-dashboard manual refresh
- show offline / stale banner
- surface background-updated indicator when visible data changed
- route deep-link intents to correct section

---

## `<AvailabilityNeededSection>`

```typescript
interface AvailabilityNeededSectionProps {
  tasks: AvailabilityTaskViewModel[];
  onOpenEvent: (eventId: string) => void;
}

interface AvailabilityTaskViewModel {
  eventId: string;
  eventTitle: string;
  ministryName: string;
  eventType: 'hourly' | 'day_based';
  eventStartLabel: string;
  eventEndLabel: string;
  completionState: 'missing' | 'partial' | 'complete';
}
```

Notes:
- section hidden when no tasks
- cards open event-scoped availability editor

---

## `<AvailabilityForm>`

```typescript
interface AvailabilityFormProps {
  event: {
    id: string;
    title: string;
    eventType: 'hourly' | 'day_based';
    startDate: string;
    endDate: string;
  };
  slots: AvailabilitySlotViewModel[];
  isEditable: boolean;
  onSave: (input: AvailabilitySaveInput) => void;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}

interface AvailabilitySlotViewModel {
  slotId: string;
  label: string;
  startTime: string;
  endTime: string;
  response?: 'available' | 'unavailable';
}

interface AvailabilitySaveInput {
  answers: Array<{
    slotId: string;
    response: 'available' | 'unavailable';
  }>;
  confirmOverlap?: boolean;
}
```

Notes:
- volunteers answer leader-defined slots instead of free-form times
- save remains disabled until every visible slot has an answer
- overlap confirmation must be explicit secondary step, not implicit retry

---

## `<UpcomingAssignmentsSection>`

```typescript
interface UpcomingAssignmentsSectionProps {
  groups: UpcomingAssignmentGroupViewModel[];
  onRespond: (assignmentId: string, response: 'confirmed' | 'declined') => void;
}
```

Behavior:
- first group with actionable assignments auto-expands on visit
- confirmed assignments show a single "cannot serve" path
- in-progress rows remain visible and show disabled actions

---

## `<NotificationsInboxSection>`

```typescript
interface NotificationsInboxSectionProps {
  unreadCount: number;
  pages: NotificationPageViewModel[];
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenNotification: (notificationId: string) => void;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
}

interface NotificationPageViewModel {
  dateBucketLabel: string;
  items: NotificationItemViewModel[];
}

interface NotificationItemViewModel {
  id: string;
  type: string;
  title: string;
  body: string;
  isUnread: boolean;
  createdAtLabel: string;
  emphasis: 'normal' | 'reminder';
}
```

Notes:
- reminders may receive stronger emphasis
- repeated notifications for same assignment remain separate items

---

## `<MinistryScheduleSection>`

```typescript
interface MinistryScheduleSectionProps {
  ministries: Array<{ id: string; name: string }>;
  selectedMinistryId?: string;
  canSwitchMinistry: boolean;
  events: MinistryScheduleEventViewModel[];
  onSelectMinistry: (ministryId: string) => void;
}
```

Notes:
- selector hidden when only one ministry exists
- Events start collapsed

---

## Global UI States

```typescript
interface DashboardMetaState {
  isOffline: boolean;
  isUsingCachedData: boolean;
  hasBackgroundUpdate: boolean;
  lastUpdatedAt?: string;
  refreshState: 'idle' | 'refreshing' | 'error';
}
```

Rules:
- one dashboard-level stale/offline banner
- background update hint only when data materially changed
- manual refresh error must not clear cached content
