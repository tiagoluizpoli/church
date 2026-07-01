# Test Coverage Plan: Volunteer Dashboard

**Feature**: Spec F2 / `specs/014-volunteer-dashboard`
**Primary Interfaces**:
- `trpc.volunteer.getVolunteerDashboard`
- `trpc.volunteer.getMyAvailability`
- `trpc.volunteer.upsertAvailability`
- `trpc.volunteer.deleteAvailability`
- `trpc.volunteer.respondToAssignment`
- `trpc.volunteer.getMyNotifications`
- `trpc.volunteer.markNotificationRead`
- `trpc.volunteer.markAllNotificationsRead`
- `trpc.volunteer.getMinistrySchedule`

---

## 1. Happy Paths

- `[ ]` Dashboard snapshot shows `Availability needed` for an upcoming Event with incomplete availability coverage → INTEGRATION
- `[ ]` Dashboard snapshot groups volunteer-owned published Assignments by Event and auto-identifies the first actionable group → INTEGRATION
- `[ ]` Volunteer saves hourly Event slot answers and receives explicit success state → INTEGRATION
- `[ ]` Volunteer saves day-based / special-date Event slot answers and task clears only after every Event slot has an answer → INTEGRATION
- `[ ]` Volunteer can still confirm a genuinely pending Assignment state and sees updated state in the dashboard snapshot → INTEGRATION
- `[ ]` Volunteer changes a previously confirmed Assignment to declined / unable-to-serve before Event start → INTEGRATION
- `[ ]` Notifications inbox returns unread items newest-first with cursor pagination → INTEGRATION
- `[ ]` Volunteer marks one notification as read and unread count decreases → INTEGRATION
- `[ ]` Volunteer marks all notifications as read and unread count becomes zero → INTEGRATION
- `[ ]` Ministry schedule returns one selected Ministry with only current/upcoming published Events → INTEGRATION
- `[ ]` Dashboard route renders sections in priority order using snapshot data → COMPONENT
- `[ ]` Notifications inbox renders unread styling, date buckets, and load-more affordance → COMPONENT
- `[ ]` Full volunteer journey: open dashboard, submit slot availability, flag unable-to-serve state safely, review inbox → E2E

## 2. Permission Matrix

- `[ ]` Anonymous caller cannot access any volunteer dashboard procedure → INTEGRATION
- `[ ]` Volunteer cannot read or mutate another volunteer's availability entry → INTEGRATION
- `[ ]` Volunteer cannot respond to another volunteer's Assignment → INTEGRATION
- `[ ]` Volunteer cannot read or mutate another volunteer's notifications → INTEGRATION
- `[ ]` Volunteer cannot request unpublished or leader-only ministry schedule details → INTEGRATION

## 3. Edge Cases & Validation

- `[ ]` Dashboard shows explicit empty state when there are no upcoming Assignments but there are availability tasks → INTEGRATION
- `[ ]` Dashboard shows explicit empty state when there are no upcoming Assignments and no published ministry schedule data → COMPONENT
- `[ ]` Partial Event slot answers keep `Availability needed` visible → INTEGRATION
- `[ ]` Availability save rejects incomplete slot-answer submissions → INTEGRATION
- `[ ]` Day-based / special-date slot answers persist with correct event scope → INTEGRATION
- `[ ]` In-progress Assignments remain visible and disable response controls → INTEGRATION
- `[ ]` Scheduled assignments require destructive confirmation before `I cannot serve` is submitted → COMPONENT
- `[ ]` Notification deep-link fallback points to the most relevant surviving section when original target is gone → INTEGRATION
- `[ ]` Multi-ministry volunteer defaults the ministry schedule to the Ministry of the next upcoming Assignment → INTEGRATION
- `[ ]` Load-more pagination appends older notifications without replacing existing ones → COMPONENT
- `[ ]` Background refresh indicator stays hidden when refetched data is unchanged → COMPONENT
- `[ ]` Background refresh indicator appears when refetched snapshot materially changes → COMPONENT

## 4. System / Catastrophic Failures

- `[ ]` Manual refresh failure preserves last-known dashboard data and shows a clear failure message → COMPONENT
- `[ ]` Dashboard surfaces offline/stale-data banner when cached data is rendered → COMPONENT
- `[ ]` Notifications query failure leaves previously loaded page visible and exposes retry path → COMPONENT
- `[ ]` Availability mutation infrastructure failure returns clear error without silently clearing the task → INTEGRATION
- `[ ]` Dashboard route degrades gracefully when one secondary section query fails after primary snapshot succeeds → COMPONENT
- `[ ]` Full offline journey: after prior online load, volunteer can still read cached assignments / notifications / schedule while writes stay disabled → E2E

## 5. Concurrency / State Transition Failures

- `[ ]` Double-submit on availability save does not create duplicate event-scoped slot-answer rows for the same payload → INTEGRATION
- `[ ]` Background refetch during assignment response does not revert the confirmed/declined state incorrectly → COMPONENT
- `[ ]` Assignment becomes in-progress between load and click, and mutation rejects with UI re-synced to disabled controls → INTEGRATION
- `[ ]` Session expires between dashboard load and write mutation, and client surfaces authorization failure cleanly → COMPONENT

## 6. Rollout / Overlap Policy

- `[ ]` Overlap save warning returns non-blocking confirmation path when rollout flag allows overlap saves → INTEGRATION
- `[ ]` Overlap save is blocked with explicit message when rollout flag disallows overlap saves → INTEGRATION

---

## First TDD Slice

Tracer bullet:

- `[ ]` `getVolunteerDashboard` returns an `Availability needed` task for an upcoming Event with unanswered required slots → INTEGRATION

Reason:
- Highest-priority user story
- Stabilizes the canonical dashboard query contract
- Forces real handling of time filtering, volunteer ownership, and derived dashboard task logic
