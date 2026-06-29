# Data Model: Volunteer Dashboard

**Branch**: `develop` | **Date**: 2026-06-29

This file documents the domain and persistence shapes needed for the volunteer dashboard feature. It focuses on new or changed entities only.

---

## 1. Event Availability Entry

### Purpose

Volunteer-owned availability input for one specific Event, stored as explicit time/day spans.

### Persistence

Extend existing `availability` table / entity.

### Fields

| Field | Type | Notes |
|------|------|-------|
| `id` | UUID | Existing |
| `churchId` | UUID | Existing isolation key |
| `volunteerId` | UUID | Existing owner |
| `eventId` | UUID \| null | **New**. Set for dashboard event-scoped entries |
| `type` | `'available' \| 'unavailable'` | Existing; MVP dashboard mainly uses `unavailable` blocks |
| `startTime` | timestamptz | Existing |
| `endTime` | timestamptz | Existing |
| `isAllDay` | boolean | Existing; useful for day-span events |
| `reason` | string \| null | Existing optional text |
| `repeatRule` | string \| null | Existing, unused for dashboard MVP |

### Validation Rules

- `startTime < endTime`
- if `eventId` present, referenced Event must belong to same `churchId`
- volunteer may only create/update rows for their own `volunteerId`
- dashboard completion calculation uses only rows tied to the current `eventId`

### State / Behavior

- editable until Event start
- supports multiple rows for hourly Events
- supports one or more all-day style spans for day-based Events

---

## 2. Availability Task

### Purpose

Derived dashboard task telling a volunteer they still owe enough availability coverage for a specific upcoming Event.

### Persistence

Derived only. No dedicated table.

### Fields

| Field | Type | Notes |
|------|------|-------|
| `eventId` | UUID | Task target |
| `eventTitle` | string | Display |
| `ministryId` | UUID | Context |
| `ministryName` | string | Display |
| `eventType` | `'hourly' \| 'day_based'` | Input mode selector |
| `eventStart` | Date | Used for urgency / editability |
| `eventEnd` | Date | Used for completion / stale rules |
| `completionState` | `'missing' \| 'partial' \| 'complete'` | Derived |
| `overlapsPublishedAssignment` | boolean | Derived during save confirmation flow |

### Completion Rule

- `complete` only when volunteer-submitted event-scoped spans cover the full relevant Event span
- `partial` remains visible in dashboard
- task disappears once `complete` or once Event has started/ended per product rule

---

## 3. Upcoming Assignment Group

### Purpose

Volunteer-facing grouping of the volunteer's own published Assignments for one Event.

### Persistence

Derived from existing `event`, `time_slot`, `assignment`, `role`, `ministry`, `team`, `volunteer`.

### Fields

| Field | Type | Notes |
|------|------|-------|
| `eventId` | UUID | Group key |
| `eventTitle` | string | Display |
| `ministryId` | UUID | Context |
| `ministryName` | string | Display |
| `eventStart` | Date | Sort / grouping |
| `aggregateResponseState` | `'pending' \| 'confirmed' \| 'mixed' \| 'declined'` | Header summary |
| `hasPendingResponse` | boolean | Auto-expand rule |
| `assignments` | `UpcomingAssignmentItem[]` | Group contents |

### `UpcomingAssignmentItem`

| Field | Type | Notes |
|------|------|-------|
| `assignmentId` | UUID | Existing |
| `slotId` | UUID | Existing |
| `roleId` | UUID | Existing |
| `roleName` | string | Display |
| `teamId` | UUID \| null | Existing optional |
| `teamName` | string \| null | Display |
| `startTime` | Date | Existing |
| `endTime` | Date | Existing |
| `status` | `'pending' \| 'confirmed' \| 'declined'` | Existing published volunteer-facing states |
| `timingState` | `'in_progress' \| 'upcoming'` | Derived |
| `canRespond` | boolean | False once in progress |

---

## 4. Volunteer Notification

### Purpose

Durable scheduling inbox record shown to volunteers.

### Persistence

New table and domain entity recommended: `volunteer_notification`

### Fields

| Field | Type | Notes |
|------|------|-------|
| `id` | UUID | Primary key |
| `churchId` | UUID | Isolation |
| `volunteerId` | UUID | Owner |
| `ministryId` | UUID \| null | Context |
| `eventId` | UUID \| null | Context |
| `assignmentId` | UUID \| null | Context |
| `type` | enum | `schedule_published`, `assignment_added`, `assignment_changed`, `assignment_removed`, `availability_reminder`, `assignment_reminder` |
| `title` | varchar | List summary |
| `body` | text | Detail copy |
| `payload` | jsonb | Deep-link and change metadata |
| `readAt` | timestamptz \| null | Read state |
| `createdAt` | timestamptz | Newest-first ordering |

### Validation Rules

- volunteer may only read / mutate their own notifications
- `payload` must contain enough metadata to resolve a meaningful current destination even if original target changed
- no delete in MVP

### State Transitions

- `unread` -> `read` via `markNotificationRead`
- `unread` -> `read` for many rows via `markAllNotificationsRead`
- notifications are immutable after creation except `readAt`

### Indexing

- `(church_id, volunteer_id, created_at desc)` for inbox paging
- partial unread index on `(church_id, volunteer_id)` where `read_at is null`

---

## 5. Ministry Schedule View

### Purpose

Read-only volunteer-facing view of one selected Ministry's current and upcoming published schedule.

### Persistence

Derived from existing `event`, `time_slot`, `slot_requirement`, `assignment`, `team`, `role`, `volunteer`.

### Fields

| Field | Type | Notes |
|------|------|-------|
| `ministryId` | UUID | Selected ministry |
| `ministryName` | string | Display |
| `events` | `MinistryScheduleEvent[]` | Current/upcoming only |

### `MinistryScheduleEvent`

| Field | Type | Notes |
|------|------|-------|
| `eventId` | UUID | Existing |
| `title` | string | Display |
| `startDate` | Date | Ordering |
| `endDate` | Date | Ordering |
| `assignmentCount` | number | Header summary |
| `rows` | `MinistryScheduleRow[]` | Expanded content |

### `MinistryScheduleRow`

| Field | Type | Notes |
|------|------|-------|
| `slotId` | UUID | Existing |
| `slotLabel` | string | Time or label |
| `roleName` | string | Existing |
| `teamName` | string \| null | Show when present |
| `volunteerDisplayName` | string \| null | `First L.` format |
| `confirmationState` | `'pending' \| 'confirmed' \| 'declined' \| 'open'` | Volunteer-facing only |

### Exclusions

- no leader-only conflict markers
- no override audit reasons
- no internal staffing diagnostics

---

## 6. Volunteer Dashboard Snapshot

### Purpose

Top-level query result for first dashboard paint.

### Persistence

Derived aggregator DTO only. No table.

### Fields

| Field | Type | Notes |
|------|------|-------|
| `availabilityTasks` | `AvailabilityTask[]` | Priority section |
| `upcomingAssignmentGroups` | `UpcomingAssignmentGroup[]` | Main schedule section |
| `notificationUnreadCount` | number | Inbox summary |
| `notificationPreview` | `VolunteerNotification[]` | Optional first page / summary |
| `defaultMinistryId` | UUID \| null | For ministry schedule section |
| `ministryOptions` | Array<{ id, name }> | Selector when multi-ministry |
| `isOfflineCapable` | boolean | Static client hint |
| `fetchedAt` | Date | Refresh comparison |

---

## 7. Schema Changes Summary

### `packages/db/src/schema/assignments.ts`
- add nullable `eventId` FK to `availability`
- add index for `(church_id, volunteer_id, event_id)`

### `packages/db/src/schema/enums.ts`
- add `volunteerNotificationTypeEnum`

### `packages/db/src/schema/volunteer-notifications.ts`
- add `volunteerNotification` table

### Domain / Repository Additions
- `VolunteerNotification` entity
- `VolunteerNotificationRepository`

---

## 8. Out of Scope For This Feature

- reminder cooldown enforcement backlog item (`BL-005`)
- dedicated `Now Serving` section backlog item (`BL-004`)
- full feature-flag platform rollout (use env-backed seam first)
- offline write queueing
