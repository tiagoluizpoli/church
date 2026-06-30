# Handoff: F2 Volunteer Dashboard Grilling

## Scope

This handoff is tied specifically to:

- `manual-planning/0001-volunteer-scheduling/specifications/F2-volunteer-dashboard.md`
- the related volunteer-facing planning refinements discussed during the F2 grilling session through 2026-06-29

This is not a general project handoff. It is intended for continuing the **volunteer dashboard specification / implementation lane** in parallel with other work.

## What Was Updated

The following planning artifacts were updated to reflect the grilling decisions:

- [specifications/F2-volunteer-dashboard.md](../specifications/F2-volunteer-dashboard.md)
- [specifications/A2-volunteer-api.md](../specifications/A2-volunteer-api.md)
- [specifications/10-scheduling-api.md](../specifications/10-scheduling-api.md)
- [specifications/11-notifications.md](../specifications/11-notifications.md)
- [specifications-list.md](../specifications-list.md)
- [business-overview.md](../business-overview.md)
- [domain-data-model.md](../domain-data-model.md)
- [ui-ux-flow.md](../ui-ux-flow.md)
- [BACKLOG.md](../BACKLOG.md)

## Key Locked Decisions

- Volunteer Dashboard is the canonical volunteer surface.
- Dashboard sections:
  - `Availability needed`
  - `My Upcoming Assignments`
  - `Notifications Inbox`
  - `Ministry Schedule`
- `Availability needed` is highest priority and opens directly into event-specific availability input.
- Availability is entered **per Event**.
- Original grilled assumption: Hourly Events use **time spans** and day-based Events use **day spans**.
- Refined implementation direction as of 2026-06-29: leaders define the relevant service blocks, and volunteers answer those concrete slots. The Event scope remains, but the volunteer no longer authors free-form spans in the dashboard MVP.
- Availability overlap with a published assignment:
  - warn clearly
  - explain staffing/reassignment consequence
  - require explicit confirmation
  - still allow save
  - this behavior should be rollout-friendly behind a feature-flag-style mechanism initially
- `My Upcoming Assignments`:
  - published only
  - cross-ministry
  - grouped by Event
  - includes in-progress assignments until they end
  - in-progress items show a visible badge
  - response controls disabled once in progress
- Volunteer responses:
  - per Assignment
  - no decline reason in MVP
  - previously confirmed can change to declined before Event start
  - short undo window
- Notifications:
  - real historical inbox
  - read/unread
  - no delete
  - mark all as read
  - kept indefinitely in MVP
  - progressively loaded from newest to oldest
  - reminder notifications intentionally noisier
  - dashboard remains source of truth
- Ministry Schedule:
  - one selected Ministry at a time
  - full Ministry visibility across Teams
  - read-only
  - current and upcoming published Events only
- Offline:
  - read-only sections cached
  - writes stay online-only in MVP
- Refresh:
  - manual refresh = whole dashboard
  - reconnect refetch = automatic
  - periodic background refresh = yes
  - silent when nothing changed
  - subtle user-facing signal when data actually changed in the background

## Backlog Items Added / Relevant

- [BL-004](../BACKLOG.md): Separate `Now Serving` section for in-progress assignments
- [BL-005](../BACKLOG.md): Configurable cooldown for repeated availability reminders

Important nuance on `BL-005`:

- start with a deployment-level config source such as an environment variable
- migrate later to a better long-term configuration surface if needed

## Recommended Next Work

### If continuing planning/spec work

1. Review the updated F2 spec and verify whether any remaining high-value unanswered questions still exist.
2. If needed, continue grilling only on implementation-shaping decisions, not cosmetic ones.
3. Keep backlog additions scoped and explicit when a decision is intentionally deferred.

### If starting implementation

1. Treat [specifications/F2-volunteer-dashboard.md](../specifications/F2-volunteer-dashboard.md) as the current source for volunteer-dashboard behavior.
2. Cross-check implementation against:
   - [specifications/A2-volunteer-api.md](../specifications/A2-volunteer-api.md)
   - [specifications/10-scheduling-api.md](../specifications/10-scheduling-api.md)
   - [specifications/11-notifications.md](../specifications/11-notifications.md)
3. Preserve the rollout note around the overlapping-availability-save behavior so it can be feature-flagged early.

## Suggested Skills

- `grill-with-docs`
- `handoff`
- `backend-specialist`
- `test-backend`
- `frontend-specialist`

## Notes For The Next Agent

- Do not treat the old standalone `/availability` route shape as the product direction; the dashboard is the intended canonical volunteer surface now.
- Do not reintroduce decline-reason-required behavior for MVP unless the user explicitly reopens that decision.
- Do not downgrade reminder visibility accidentally; the user explicitly accepted a noisier reminder model for MVP.
