# Handoff: Two Broken Scheduling E2E Specs

## Purpose

Two E2E specs are failing on the current `018-churchwide-ux-redesign` branch, discovered incidentally while doing UI layout work (not caused by it — see "Why these aren't UI bugs" below). Next session should diagnose and fix these; this doc is reproduction + leads only, no fix attempted yet.

## Current State

- Repo: `/home/tiago/01-dev-env/personal-repos/church/church`
- Branch: `018-churchwide-ux-redesign`
- Communication mode: `caveman`
- Full `bun run test:e2e` result at time of writing: **28 passed, 2 failed, 1 skipped**
- `bun run check-types` and `bun run test` (unit/component, 138 tests): both green

## Why these aren't UI bugs

The session that found them only touched: 4 legacy route wrappers (dashboard/availability/notifications/home), `scheduling-nav.tsx`, `planning-admin.tsx` (header/stepper layout), `index.css`. Neither failing spec exercises any of those files. `git status` shows the server-side files below were already staged before this UI session started (leftover from an earlier interrupted session, unrelated feature: adding `systemRole` to schedule-builder volunteer options) — that diff was checked and is unrelated to either failure too.

## Bug 1: Planning cycle event generation produces 0 events

- Spec: `apps/web/tests/scheduling/us1-admin-plan.spec.ts:156`
- Test: "church admin can plan, review, and lock a cycle while volunteers stay hidden from it"
- Repro: create cycle → create 2 event templates (Sunday 3 blocks, Wednesday 1 block) → click `apply-templates-button` → expect `planning-event-card` testid count to equal `month.expectedEvents` (9)
- Actual: count is **0** (timeout after 14 retries)
- Failing assertion: `apps/web/tests/scheduling/us1-admin-plan.spec.ts:246`

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  getByTestId('planning-event-card')
Expected: 9
Received: 0
```

- `planning-event-card` testid still exists in [planning-event-card.tsx:16](apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx#L16) — not a removed-testid issue.
- Prime suspects (heaviest mid-refactor diffs from the interrupted prior session, per original `git status`):
  - [use-planning-admin-mutations.ts](apps/web/src/features/scheduling/components/planning-admin/use-planning-admin-mutations.ts) (−47 lines net)
  - [use-planning-admin.ts](apps/web/src/features/scheduling/components/planning-admin/use-planning-admin.ts) (−62 lines net)
  - [cycle-review-card.tsx](apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx) (~131 lines changed)
- Check first: does `apply-templates-button`'s click handler still call the same mutation/invalidation chain it used to? Does the event-generation request even fire (network tab / server log), or does it fire but the response mapping into `cycleEvents` silently drop everything?

## Bug 2: Roster publish doesn't transition participation state

- Spec: `apps/web/tests/scheduling/us4-roster-publish.spec.ts:26`
- Test: "DL4-US4 leader assigns one volunteer, publishes below full, volunteer sees published slice, sibling ministry stays unpublished"
- Repro: leader opens roster, assigns 1 of 2 required positions, clicks `publish-participation-button` (confirms native dialog), then GETs `/api/v1/leader/cycles/:cycleId/participation` for both ministries
- Expected: worship ministry's participation state becomes `published`
- Actual: stays **`rostering`**
- Failing assertion: `apps/web/tests/scheduling/us4-roster-publish.spec.ts:89`

```
Error: expect(received).toBe(expected)
Expected: "published"
Received: "rostering"
```

- Test title says "publishes below full" — confirms intent is that publish is a leader action independent of hitting full headcount (1 of 2 assigned is enough to attempt publish). `CONTEXT.md`'s `MinistryParticipation` lifecycle is `tailoring → availability_fired → rostering → published`; getting stuck at `rostering` means either:
  - the publish click never reached the server (dialog-accept race — `page.once('dialog', ...)` registered right before `.click()`, common Playwright flake pattern if the click resolves before the handler attaches), or
  - the publish endpoint is enforcing a full-headcount gate that contradicts the "publish below full" intent, or
  - a genuine state-transition regression in whatever recently touched participation publish logic.
- Start by running just this spec locally with `--headed` to see whether the confirm dialog actually appears/gets accepted, before touching backend code.

## Suggested Next Actions

1. `cd apps/web && bunx playwright test tests/scheduling/us1-admin-plan.spec.ts --headed` — watch whether "Apply templates" visibly generates events in the UI.
2. `cd apps/web && bunx playwright test tests/scheduling/us4-roster-publish.spec.ts --headed` — watch the publish click + dialog.
3. If Bug 1 is a hook regression, diff `use-planning-admin.ts` / `use-planning-admin-mutations.ts` against the last commit before the interrupted layout session touched them (`git log -p` on those files).
4. If Bug 2 is a dialog race, fix the spec (attach `page.once('dialog', ...)` before triggering any click that could show it, not just this one). If it's a real backend gate, find the publish handler in `apps/server` and confirm against `CONTEXT.md`'s stated lifecycle.
5. Re-run full `bun run test:e2e` after each fix to confirm no other spec regresses.

## Suggested skills

- `diagnose` / `diagnosing-bugs` for the actual root-cause work
- `test-e2e` if Playwright-specific flake patterns need auditing beyond these two

## Sensitive information

- Redacted: no real user IDs, seeded test credentials, tokens, or secrets copied here (IDs shown are fixture constants from the spec file itself, not live data).
