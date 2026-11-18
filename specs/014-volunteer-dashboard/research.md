# Research: Volunteer Dashboard

**Branch**: `014-volunteer-dashboard` | **Date**: 2026-06-29

---

## 1. Existing Inventory

### Already present

**Frontend**

- `/dashboard` route exists, but is placeholder-only
- `/availability` route exists with a standalone `AvailabilityForm`
- React Query + tRPC TanStack proxy already configured in `apps/web/src/utils/trpc.ts`
- Volunteer feature folder already exists: `apps/web/src/features/volunteers`

**Backend**

- `volunteerRouter` exists, but only exposes `respondToAssignment`
- Existing scheduling / assignment / availability repositories already support:
  - volunteer lookup by current user
  - assignment listing
  - availability persistence by time range
  - schedule / slot / requirement reads
- Notification delivery service exists only as transient publisher (`local-notification-service`), not inbox storage

**Schema**

- `event.eventType` already exists (`hourly` / `day_based`)
- `availability` currently stores time-based blocks only
- no inbox table or notification read-state persistence exists today

---

## 2. Decision: Event-Scoped Availability Uses Existing Table With Added `eventId`

**Decision**: Extend `availability` with an optional `eventId` foreign key instead of creating a second event-specific availability table.

**Rationale**:

- Existing conflict / availability logic already works from time ranges
- Day-span retreat availability can still be represented with UTC start/end bounds and `isAllDay`
- Dashboard completion rules need exact Event ownership; `eventId` provides that cleanly
- This avoids maintaining parallel availability concepts with overlapping semantics

**Alternatives considered**:

- **New `event_availability` table**: clearer naming, but duplicates existing range semantics and increases mapper / engine complexity
- **Keep global-only availability with no `eventId`**: cannot reliably determine whether a volunteer intentionally completed availability for a specific Event

### Refinement — 2026-06-29

The storage decision above still stands, but the volunteer interaction model changed during implementation. We are still using `availability + eventId`, but the dashboard now maps answers to leader-defined slots instead of collecting volunteer-authored time/day spans. This keeps persistence simple while aligning the UX with the real scheduling workflow described by the user.

---

## 3. Decision: Dashboard Query Shape = Summary Snapshot + Progressive Detail Queries

**Decision**:

- `getVolunteerDashboard` returns initial summary data for all four sections plus default ministry selection and refresh metadata
- `getMyNotifications` remains its own cursor-based query
- `getMinistrySchedule` remains its own query keyed by selected ministry

**Rationale**:

- `Availability needed` and `My Upcoming Assignments` are above-the-fold and should arrive together
- Notifications need progressive loading and read-state mutation
- Ministry schedule is read-only, secondary priority, and ministry-switchable
- This split keeps manual refresh simple while avoiding an oversized infinite dashboard payload

**Alternatives considered**:

- **One giant dashboard query for every section and every page**: simpler client shape, but poor fit for historical inbox pagination
- **Many tiny per-card queries**: too much client orchestration and too much first-load latency

---

## 4. Decision: Notification Inbox Requires New Durable Persistence

**Decision**: Add a new durable volunteer notification entity, repository, and schema table for scheduling inbox history.

**Rationale**:

- Current notification service only publishes transient events
- MVP explicitly requires real historical inbox, read/unread state, mark-all-as-read, indefinite retention, and deep-link recovery
- Those requirements are persistence concerns, not client-only cache behavior

**Recommended minimal table shape**:

- `id`
- `churchId`
- `volunteerId`
- `ministryId?`
- `eventId?`
- `assignmentId?`
- `type`
- `title`
- `body`
- `payload` / metadata JSON
- `readAt?`
- `createdAt`

**Alternatives considered**:

- **Reuse assignment audit**: wrong owner and wrong semantics; audit is leader/assignment history, not volunteer inbox
- **Client-side local inbox only**: fails cross-device persistence and server-driven schedule history

---

## 5. Decision: Use Existing tRPC + React Query Stack for Refresh / Offline Behavior

**Decision**: Keep existing tRPC transport and lean on TanStack Query behavior already present in the repo for:

- reconnect refetch
- interval refetch
- cache retention for read-only offline usage
- mutation invalidation / optimistic local transitions where safe

**Rationale**:

- Repo already uses `@trpc/tanstack-react-query`
- User concern about React Query is already satisfied by current architecture
- No need to replace tRPC to get stale/refetch/caching controls

**Implementation notes**:

- Manual refresh should invalidate whole dashboard family together
- Background polling should be conservative
- UI should only show update signal when fresh data differs from last rendered snapshot

**Alternatives considered**:

- **Replace tRPC with plain REST + React Query**: high churn, no feature benefit for MVP
- **No background refresh**: misses user-requested auto-recovery / subtle freshness behavior

---

## 6. Decision: Overlap-Save Rollout Uses Env-Backed Flag Interface First

**Decision**: Add a server-side config flag through `@church/env/server` and route overlap-save policy through a small app-level decision helper.

**Rationale**:

- Repo has no existing feature-flag infrastructure or Unleash client
- User wants rollout flexibility now
- Env-backed control fits current constitution and can later be swapped behind same helper to a richer provider

**Suggested first flag**:

- `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE`

**Behavior**:

- `true`: warn + confirm + allow save
- `false`: warn + block save with explicit message

**Alternatives considered**:

- **Hard-code allow**: no rollout control
- **Introduce full Unleash infra inside this feature slice**: too much unrelated platform scope for MVP dashboard delivery

---

## 7. Decision: `/availability` Becomes Compatibility Entry, Not Separate Product Surface

**Decision**: Keep `/availability` temporarily, but redirect or reframe it into the dashboard flow.

**Rationale**:

- Manual planning explicitly locked dashboard as canonical volunteer surface
- Hard deleting route may break existing bookmarks
- Compatibility route reduces migration risk while preserving product direction

**Alternatives considered**:

- **Keep standalone route as equal primary flow**: directly conflicts with F2 decision
- **Delete route immediately**: possible link breakage without migration path

---

## 8. Testing Implications

**Decision**: Treat this as full-stack planning from start.

**Required coverage areas**:

- backend integration tests for volunteer ownership, published-only filters, notifications read-state, slot-based event-scoped availability
- frontend component/integration tests for badges, banners, inbox loading, overlap warning, empty states
- Playwright journeys for slot-answer availability submission, assignment exception signaling, notifications deep-linking, ministry schedule read-only view, and offline read behavior

**Rationale**:

- Feature crosses schema, API, client state, routing, and offline behavior
- Constitution and project rules require testing to be planned, not bolted on
