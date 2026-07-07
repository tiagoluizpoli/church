# Phase 1 Data Model: Church-wide UX/IA Redesign

This feature introduces **no new domain entities** — it reorganizes presentation over the scheduling domain already documented in `CONTEXT.md` (`Volunteer`, `Ministry`, `PlanningCycle`, `EventTemplate`, `Event`, `MinistryParticipation`, `Shift`, `VolunteerNotification`, etc.). Nothing below is persisted; these are client-side view-model/derived-state shapes only, each following Constitution VII (named object parameter/return types, no inline object typing).

## CallerNavVisibility

Derived, not fetched or stored. Resolved client-side per `research.md` R1.

| Field | Type | Meaning |
|---|---|---|
| `canSeeScheduling` | `boolean` | Whether the Scheduling nav entry should render — true when the caller holds a Leader, Sub-leader, or Church Admin capacity in at least one Ministry (or church-wide, for Church Admin) |
| `isResolving` | `boolean` | True until the underlying gating query settles; nav should assume `canSeeScheduling: false` while resolving, to avoid a flash of a nav item the caller can't use |

Every caller — regardless of role — sees `Dashboard` and `Availability`; `canSeeScheduling` only ever adds, never removes, from that base set (Q-nav-scope decision).

## PlanningStep

Derived from existing `use-planning-admin.ts` query state (`research.md` R4); not a persisted field on `PlanningCycle`.

| Value | Condition | What renders |
|---|---|---|
| `create-cycle` | No cycle selected / `cycles.length === 0` | `CreateCycleCard` only |
| `template-and-review` | A cycle is selected and not locked | `TemplateManagerCard` + `CycleReviewCard`; `CycleListCard` demoted to a secondary history panel |
| `locked-review` | `selectedCycle.status === 'locked'` | Read-only review of the locked cycle; no editable template/create controls |

## NotificationBellViewModel

Thin view over the existing `useNotificationInbox` hook's output (`research.md` R3) — no new fetching logic, just a bounded slice for the dropdown vs. the full list for `/notifications`.

| Field | Type | Meaning |
|---|---|---|
| `unreadCount` | `number` | Sourced from the existing hook's `unreadCount` |
| `recentItems` | `NotificationInboxItem[]` | First N (dropdown-bounded) items, unread-first, from the existing `items`/`pages` |
| `hasMore` | `boolean` | Existing `hasMore`, drives the "View all" full-history entry point |

`NotificationInboxItem` and its `deepLink` shape (`section`, `eventId`, `ministryId`, `assignmentId`) are unchanged from the existing `use-notification-inbox.ts` — reused as-is, not redefined.

## DashboardTabId

Replaces the flat vertical stack in `volunteer-dashboard.tsx` with an explicit, named set of sections a Volunteer switches between.

| Value | Default? | Badge |
|---|---|---|
| `upcoming-assignments` | Yes (Q-dashboard-split decision) | none |
| `availability-needed` | No | outstanding-item count |
| `ministry-schedule` | No | none |

Notifications is intentionally **not** a `DashboardTabId` value — it has fully moved to the top-bar bell (Q-notification-bell decision) and is not represented on the dashboard in any form.

## AssigneeIdentityBadge

Presentational-only addition to the schedule builder's existing volunteer/assignee row rendering (Q-identity-badge decision: "both" — badge shown by default, full label available on hover/expand).

| Field | Type | Meaning |
|---|---|---|
| `roleLabel` | `'Leader' \| 'Sub-leader'` | Rendered as a small badge/chip beside the (possibly still-truncated) volunteer name |
| `fullNameOnExpand` | `string` | Full, untruncated name+role shown on hover/expand, in addition to the always-visible badge |

No new domain concept — `roleLabel` is a direct, unmodified read of the existing `MinistrySystemRole` (`'leader' | 'sub_leader'`) already returned by the volunteer/membership data the builder consumes.

## PlanningCycleHeaderModel *(added 2026-07-07 amendment)*

Splits the previously-combined header chip (`<name> [status] <start> → <end>`) into two independently-rendered pieces (FR-018, FR-019). Derived, not persisted — reads the same `selectedCycle` data `PlanningStep` already consumes.

| Field | Type | Meaning |
|---|---|---|
| `nameAndStatus` | `{ name: string; status: PlanningCycleState }` | The name+status chip — this is now the **only** place cycle status renders anywhere on the screen |
| `period` | `{ startDate: Date; endDate: Date }` | The separate date-range chip |

`CycleReviewCard`/`Selected cycle review` and the `Calendar review` section stop rendering their own status badge entirely — they read cycle data for their own purposes but no longer duplicate `nameAndStatus.status` (`research.md`/grilling session Q-status-chip-dedup, option (a)).
