# Handoff: Scheduling Reality Alignment

## Purpose

Next session should continue scheduling-builder reality alignment after latest availability / self-assignment fixes, focusing on remaining product/domain decisions plus one nuanced builder-status issue still open.

## Current State

- Repo: `/home/tiago/01-dev-env/personal-repos/church/church`
- Communication mode: `caveman`
- Recent builder/dashboard fixes completed:
  - drag overlay restored
  - sidebar `Select slot` flow restored
  - empty requirement cell can assign selected sidebar volunteer
  - slot creation modal uses segmented time-only input
  - new slot defaults to full event window
  - split-turn wizard copy now frames common path vs long-event special case better
  - self-assignment bug fixed: volunteer `available` answers no longer act like blockouts during assignment
  - leader scheduling view now sees event-scoped volunteer availability answers
  - reminder flow now treats event-scoped availability answers as real responses

## Current Safeguard State

- Green:
  - `bun run check`
  - `bun run check-types`
  - `bun run test`
- Still red:
  - `bun run test:e2e`
  - Remaining failure is isolated to `apps/web/tests/scheduling/us2-conflict-override.spec.ts`
  - Exact problem: SC-002 timing assertion still misses 1s SLA on cold run (`~1116ms` in latest run)
  - Other E2E flows affected by recent availability work were rechecked and passed

## Important Behavior Clarifications From User

### 1. Availability is not assignment

User expectation:
- volunteer answers should only express availability
- answering `available` must not auto-assign anyone
- leaders are also volunteers by default and should be assignable like everyone else

This is now fixed for self-assignment:
- root cause was `available` entries being treated like blockouts in assignment conflict check
- fix lives in:
  - [apps/server/src/routers/admin-leader/create-assignment.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/src/routers/admin-leader/create-assignment.ts)
  - [apps/server/tests/integration/routers/create-assignment.test.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/tests/integration/routers/create-assignment.test.ts)

### 2. Leader should see volunteer availability in scheduling view

This was missing before. It is now partly fixed:
- leader builder/sidebar now sees event-scoped `available` / `unavailable` answers
- reminder logic now counts event answers correctly

Relevant files:
- [apps/server/src/routers/admin-leader/get-schedule-builder-data.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/src/routers/admin-leader/get-schedule-builder-data.ts)
- [apps/server/src/routers/admin-leader/send-reminder.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/src/routers/admin-leader/send-reminder.ts)
- [apps/web/src/features/scheduling/utils/availability-status.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/web/src/features/scheduling/utils/availability-status.ts)
- [apps/server/tests/integration/routers/admin-leader.test.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/tests/integration/routers/admin-leader.test.ts)
- [apps/server/tests/integration/routers/send-reminder.test.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/tests/integration/routers/send-reminder.test.ts)

### 3. Still-open nuance: assigned leader still looks “available”

User reports remaining weirdness:
- if leader assigns self to event, UI still reads like fully available
- user expects some “partially locked” / “already serving here” signal, similar to how other partially unavailable states read

Important nuance:
- current builder status model now shows event-scoped answer state first
- if volunteer answered `available` and also has assignment in same event, status still shows `available`
- system does not yet surface a richer combined state like:
  - “available but already assigned”
  - “partially locked”
  - “serving in this event”

This is unresolved. Next session should decide whether this is:
- sidebar status-layer problem
- badge/secondary-label problem
- workload/conflict explanation problem

Likely code seam:
- [apps/server/src/routers/admin-leader/get-schedule-builder-data.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/server/src/routers/admin-leader/get-schedule-builder-data.ts)
- [apps/web/src/features/scheduling/components/builder/volunteer-card.tsx](/home/tiago/01-dev-env/personal-repos/church/church/apps/web/src/features/scheduling/components/builder/volunteer-card.tsx)
- [apps/web/src/features/scheduling/components/builder/volunteer-pool-sidebar.tsx](/home/tiago/01-dev-env/personal-repos/church/church/apps/web/src/features/scheduling/components/builder/volunteer-pool-sidebar.tsx)
- [apps/web/src/features/scheduling/hooks/use-volunteer-pool.ts](/home/tiago/01-dev-env/personal-repos/church/church/apps/web/src/features/scheduling/hooks/use-volunteer-pool.ts)

## Remaining Product / Domain Items

### 1. Event / ministry / slot model must fit church reality better

User’s domain view:
- events should be church/service based, not ministry-owned in product meaning
- example: Sunday 8:00, 10:00, 18:30 services should each be their own event
- ministries participate in same service rather than invent separate ministry events
- many ministries need parallel staffing in same service, not staggered micro-times
- example: kids ministry may need 5 people at same time, not 5 different rows

What still needs decision:
- is current `event.ministryId` acceptable as implementation seam for now?
- is parallel staffing already good enough through `requiredCount`, with UX gaps only?
- should service-first event semantics wait until after current spec lane lands?

Primary references:
- `manual-planning/0001-volunteer-scheduling/domain-data-model.md`
- `manual-planning/0001-volunteer-scheduling/ui-ux-flow.md`
- `manual-planning/0001-volunteer-scheduling/specifications/A2-volunteer-api.md`
- `manual-planning/0001-volunteer-scheduling/specifications/F2-volunteer-dashboard.md`
- `specs/014-volunteer-dashboard/spec.md`
- `specs/014-volunteer-dashboard/tasks.md`

### 2. Long-event turn splitting inside event window

User wants optional splitting for long events:
- example: event runs `12:00 -> 22:00`
- leader may want `2` or `3` turns
- should stay constrained to event window
- should be optional, not default path for normal services

Progress already made:
- builder empty state and wizard copy now emphasize:
  - common case = one slot for full event
  - special case = split event into turns

Still open:
- should split be count-first, duration-first, or both?
- should “split into turns” become first-class product language everywhere?
- should custom spans wait until later?

Relevant files:
- [apps/web/src/features/scheduling/components/builder/empty-builder-state.tsx](/home/tiago/01-dev-env/personal-repos/church/church/apps/web/src/features/scheduling/components/builder/empty-builder-state.tsx)
- [apps/web/src/features/scheduling/components/builder/slot-generate-wizard.tsx](/home/tiago/01-dev-env/personal-repos/church/church/apps/web/src/features/scheduling/components/builder/slot-generate-wizard.tsx)

## Known Constraints

- Worktree is very dirty in many unrelated files. Do **not** revert unrelated changes.
- User wants current spec lane finished before broader cleanup or deeper builder/domain refactor.
- User prefers phase-by-phase movement, not scattered small tasks.
- Use `apply_patch` for edits.
- Tests matter; do not weaken assertions to hide real behavior.

## Suggested Skills

- `find-skills`
  - re-scan before next session
- `diagnose`
  - best fit for “assigned but still looks available” nuance + remaining E2E perf failure
- `frontend-specialist`
  - for builder status/badge communication
- `grill-with-docs`
  - to force decision on service-first events vs ministry-owned events
- `test-master`
  - for protecting builder/sidebar semantics and finishing E2E stabilization
- `handoff`
  - create next checkpoint after domain decision or E2E fix lands

## Recommended Next Move

Do **not** start broad refactors in this dirty session.

Next agent should do this order:
1. Diagnose and decide how builder should represent “available but already assigned / partially locked”.
2. Fix isolated E2E blocker in `us2-conflict-override.spec.ts`.
3. Write short decision memo for service-first event semantics and long-event split scope.
4. Only then start next product slice.
