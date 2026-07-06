# Test Plan: Church-wide UX/IA Redesign (018)

Tests are the primary safeguard, not the code. **Rule for implementation**: when a test and the implementation disagree, the code changes — never loosen or delete a test to make a red suite go green, unless the test itself is proven wrong against this plan or the spec. Every functional requirement (FR-001…014) and success criterion (SC-001…006) in `spec.md` MUST be covered by at least one test, at the lowest pyramid layer that can prove it. This document is the authoritative test-case catalogue and existing-suite audit; `/speckit-tasks` derives test tasks from it.

Per the `tdd` skill: tests are written and confirmed at pre-agreed seams before implementation, one vertical slice (one seam → one test → minimal code) at a time — not all tests up front, then all code.

## Stack mapping

| Pyramid layer | Tooling | Where |
|---|---|---|
| **L-unit** (pure functions, derived-state logic) | Vitest, no DOM | co-located `*.unit.test.ts` |
| **L-component** (React components/hooks via RTL) | Vitest + Testing Library | co-located `*.component.test.tsx` |
| **L-e2e** (full user journeys, real browser) | Playwright | `apps/web/tests/` |
| **L-http** (route contract, corrected post-`/speckit-analyze`) | Vitest + Fastify `inject` | `apps/server/src/api/controllers/*.test.ts` |

Almost no new backend layer: this feature's one exception is the `/notifications` route's querystring passthrough (`research.md` R3, corrected) — the domain/manager/repo layers already fully support cursor pagination and are already covered by their own existing tests; only the HTTP route (which never reads `request.query` today) needs a contract test proving `cursor`/`limit` reach the manager and `nextCursor` reaches the response.

## Scenario classes (applied per suite, per `test-master`)

1. Happy path · 2. Edge/boundary · 3. Invalid input · 4. Permission/role · 5. Loading/error state · 6. Empty state. Not every class applies to every suite (e.g., "invalid input" rarely applies to a nav-visibility test) — where N/A, the suite simply omits it; no need to force a class that doesn't fit.

---

## Part A — Existing test inventory & disposition

Every existing test file that touches a surface this feature changes, audited file-by-file. Disposition values: **KEEP** (unaffected, no change needed), **UPDATE** (behavior it asserts changes, must be edited), **REPLACE** (the thing it tests is being removed/relocated wholesale), **NEW** (a required seam has zero current coverage).

### L-component / L-unit (Vitest)

| File | Disposition | Why |
|---|---|---|
| `apps/web/src/__tests__/volunteer-dashboard/volunteer-dashboard-empty-states.component.test.tsx` | **UPDATE** | Asserts DOM-order across a flat vertical stack including a notifications empty state inline (`compareDocumentPosition` checks). Notifications leaves the dashboard entirely (FR-008); the stack becomes tabs (FR-009). Every existing assertion in this file must be rewritten around tab switching, not stack order. |
| `apps/web/src/__tests__/volunteer-dashboard/notifications-inbox-section.component.test.tsx` | **UPDATE** | The component itself is repurposed as the shared list-renderer for both the bell dropdown and the new `/notifications` page (`plan.md` structure). Existing list-rendering assertions (unread styling, date grouping) likely still hold; must add cases for "bounded N items" (dropdown) vs. "full paginated list" (`/notifications`) consumption modes. |
| `apps/web/src/__tests__/volunteer-dashboard/use-dashboard-refresh.component.test.ts` | **KEEP** | Background-refresh polling/indicator logic is orthogonal to section layout; not touched by this feature. |
| `apps/web/src/__tests__/volunteer-dashboard/dashboard-query-options.test.ts` | **KEEP** | Query-config construction unaffected by presentation reshuffle. |
| `apps/web/src/__tests__/volunteer-dashboard/offline-and-refresh-ui.component.test.tsx` | **UPDATE — verify** | Confirm offline/cached-data banner still renders correctly once the sections it references live inside tabs rather than a single scroll; update any selector assuming stack order. |
| `apps/web/src/__tests__/volunteer-dashboard/availability-form.component.test.tsx` | **KEEP** | Availability form itself (dialog-launched) is unaffected by dashboard IA change. |
| `apps/web/src/__tests__/volunteer-dashboard/ministry-schedule-section.component.test.tsx` | **UPDATE — verify** | Section content/behavior unchanged; becomes tab content instead of a stacked `<div>`. Confirm no test assumes a specific sibling-section DOM position. |
| `apps/web/src/__tests__/volunteer-dashboard/upcoming-assignments-section.component.test.tsx` | **UPDATE — verify** | Same as above — becomes the default tab; confirm no stack-position assumption. |
| `apps/web/src/utils/format-volunteer-name.unit.test.ts` | **KEEP** | Truncation function itself is correct and unchanged (it's meant to shorten names) — the bug is that nothing disambiguates two truncated-to-identical names by role, not that truncation is wrong. This stays exactly as-is; the fix is additive (badge), not a change to this function. |
| `apps/web/src/features/scheduling/components/quick-create-event-modal.component.test.tsx` | **UPDATE — verify** | Becomes the one canonical create-event UI (FR-012); confirm existing tests don't assume a second, different creation form exists elsewhere, and add coverage for it being reachable consistently. |
| `apps/web/src/features/scheduling/components/builder/assignment-chip.component.test.tsx` | **UPDATE** | Renders a volunteer name via `formatVolunteerName`; add role-badge assertions (FR-013) — two assignees whose names truncate identically must render distinguishable badges. |
| `apps/web/src/features/scheduling/components/builder/suggestion-list.component.test.tsx` | **UPDATE** | Same reason — renders volunteer names in a dense list, the exact "Local Leader"/"Local Sub Leader" collision surface. |
| `apps/web/src/features/scheduling/components/builder/substitution-picker.component.test.tsx` | **UPDATE** | Same reason. |
| `apps/web/src/features/scheduling/components/builder/override-dialog.component.test.tsx` | **UPDATE** | Same reason. |
| `apps/web/src/features/scheduling/components/builder/volunteer-pool-sidebar.component.test.tsx` | **UPDATE — verify** | Confirm whether this renders names directly (via `assignment-picker`/`volunteer-card`) and needs the same badge coverage. |
| `apps/web/src/features/scheduling/components/builder/builder-grid.component.test.tsx`, `empty-builder-state...`, `requirement-cell...`, `role-count-control...`, `slot-edit-modal...`, `slot-generate-wizard...`, `staffing-meter...`, `use-slot-management.unit.test.ts` | **KEEP** | Grid/slot/staffing mechanics unrelated to nav, dashboard, notifications, or identity rendering. |
| `apps/web/src/features/scheduling/hooks/use-volunteer-pool.component.test.ts` | **KEEP — verify** | Pool-fetching logic; verify it doesn't assert on rendered name strings (it shouldn't — that's the component's job). |

### New component/unit coverage required (currently zero coverage)

| Surface | File (new) | Disposition |
|---|---|---|
| `app-shell.tsx` nav-item rendering | `apps/web/src/components/app-shell.component.test.tsx` | **NEW** — no test file exists today for `AppShell` at all. Must cover: Volunteer sees exactly `Dashboard`+`Availability`; Leader/Sub-leader/Admin additionally see `Scheduling`; no dead-link nav items render for any role. |
| `use-caller-roles.ts` (new hook, `research.md` R1) | `apps/web/src/shared/hooks/use-caller-roles.unit.test.ts` | **NEW** — covers the reactive-403-derived `CallerNavVisibility` resolution, including the "assume hidden while resolving" loading state. |
| Notification bell (new component) | `apps/web/src/components/notification-bell/notification-bell.component.test.tsx` | **NEW** — unread count, dropdown open/close, item click → deep-link call-through, "View all" link target. |
| `index.tsx` (home route) | `apps/web/src/routes/index.component.test.tsx` (or Playwright-only, see Part B) | **NEW** — no banner, no duplicate `EventList`. |
| `planning-admin.tsx` step-sequence | `apps/web/src/features/scheduling/components/planning-admin.component.test.tsx` | **NEW** — zero component-level coverage exists for `PlanningAdmin` today (only E2E). Cover: no-cycle state shows only `CreateCycleCard`; cycle-selected state shows template/review steps + demoted cycle history; locked-cycle state is read-only. |
| `volunteer-dashboard.tsx` tabs | extend `volunteer-dashboard-empty-states.component.test.tsx` or new `volunteer-dashboard-tabs.component.test.tsx` | **NEW** — default tab is Upcoming Assignments; Availability Needed shows a count badge without switching; Ministry Schedule no longer shares vertical space; no Notifications tab exists. |
| `volunteer-card.tsx` | `apps/web/src/features/scheduling/components/builder/volunteer-card.component.test.tsx` | **NEW** — no test file exists today despite this being one of the six components rendering the truncated name; add role-badge coverage here too. |

### L-e2e (Playwright)

| File | Disposition | Why |
|---|---|---|
| `apps/web/tests/desktop-layout.spec.ts` | **UPDATE — extend** | Sidebar collapse/breadcrumb mechanics unaffected; add role-scoped nav-item assertions (currently asserts none). |
| `apps/web/tests/mobile-layout.spec.ts` | **UPDATE** | Line 26 hardcodes `count >= 4 // Dashboard, Shifts, Alerts, Profile` — this literally encodes the dead links as expected behavior. Must change to assert the correct role-scoped set (e.g., 2 for Volunteer) and that a bell icon exists in the mobile top header, not the bottom nav. |
| `apps/web/tests/search.spec.ts` | **KEEP** | Command palette (CMD+K) unaffected by nav/IA changes. |
| `apps/web/tests/theme.spec.ts` | **KEEP** | Visual/theme (radius, color) is explicitly out of scope for 018 (deferred to `/impeccable polish`); this suite should still pass unmodified since we aren't touching those tokens yet. |
| `apps/web/tests/timezone.spec.ts` | **KEEP** | Unrelated to IA. |
| `apps/web/tests/scheduling/smoke.spec.ts`, `cross-cutting.spec.ts` | **KEEP — verify** | Verify neither depends on `/` rendering `EventList` or on the old planning 4-card-grid layout being simultaneously visible. |
| `apps/web/tests/scheduling/us1-admin-plan.spec.ts` | **UPDATE — verify** | The action *sequence* (create cycle → template → apply → review → lock → leader views → volunteer denied) already matches a step-by-step journey and should mostly keep working since Playwright auto-waits per-locator — but the leader's `planning-cycle-option` locator lives in what becomes a demoted "secondary history panel" (R4); confirm it's still visible/reachable there, not hidden behind an extra click. |
| `apps/web/tests/scheduling/us2-leader-tailor.spec.ts` | **KEEP — verify** | Operates on `/scheduling/tailoring`, not touched by this feature; verify no incidental dependency on planning-page layout. |
| `apps/web/tests/scheduling/us4-roster-publish.spec.ts`, `us5-live-changes.spec.ts` | **UPDATE** | Both seed a `Sub-leader`/`Sub-Leader` identity (`E2E Sub-Leader Service`, `SUB_LEADER_STORAGE_STATE`) and exercise the builder — natural place to add the role-badge disambiguation assertion (FR-013), since these already set up the exact Leader-vs-Sub-leader scenario the bug needs. |
| `apps/web/tests/scheduling/a11y-builder.spec.ts` | **UPDATE** | Add an accessible-name assertion proving two differently-rôled volunteers are not screen-reader-identical (today's confirmed a11y bug from the `/impeccable` critique) — this file is the natural home for it. |
| `apps/web/tests/volunteer-dashboard/us1-availability.spec.ts`, `us2-assignments.spec.ts` | **UPDATE** | Dashboard becomes tabbed; any `?section=` deep-link must switch to the corresponding tab instead of scrolling to a stacked section — assert tab-active state, not scroll position. |
| `apps/web/tests/volunteer-dashboard/us3-notifications.spec.ts` | **REPLACE** | Entirely predicated on `/dashboard?section=notifications` rendering an inline "Notifications Inbox" — that surface no longer exists (FR-008). Replace with a new spec exercising the top-bar bell + `/notifications` route instead (see Part B new E2E list). |
| `apps/web/tests/volunteer-dashboard/us4-ministry-schedule.spec.ts` | **UPDATE — verify** | Becomes a tab; confirm deep-link/section-param behavior still resolves to the right tab. |
| `apps/web/tests/volunteer-dashboard/us5-offline.spec.ts` | **UPDATE — verify** | Confirm all three remaining tabs (not four sections) stay readable offline per `spec.md`'s inherited PWA/offline rules. |

### New E2E coverage required

| Scenario | File (new) | Covers |
|---|---|---|
| Role-scoped nav end-to-end, both viewports | extend `desktop-layout.spec.ts`/`mobile-layout.spec.ts`, or new `nav-role-scoping.spec.ts` | FR-001, FR-002, SC-001 |
| Home landing surface | new `home-landing.spec.ts` | FR-004, US1 scenario 3 |
| Notification bell full journey | new `volunteer-dashboard/us-notification-bell.spec.ts` (successor to the replaced `us3-notifications.spec.ts`) | FR-005…008, SC-002, US2 |
| Single canonical create-event UI | extend `us1-admin-plan.spec.ts` or new `single-create-event-ui.spec.ts` | FR-012, SC-004 |
| Planning step-sequence states | extend `us1-admin-plan.spec.ts` | FR-011, SC-003, US4 |
| DL2/DL3/DL4 regression pass | none new — re-run existing `specs/017-scheduling-reshape` suites against the redesigned screens | FR-014, SC-006 |

### New L-http coverage required (added post-`/speckit-analyze`, finding C1)

| Scenario | File (new) | Covers |
|---|---|---|
| `/notifications` route passes `cursor`/`limit` querystring through to the manager and returns `nextCursor` | new `apps/server/src/api/controllers/volunteer-controller.test.ts` (Fastify `inject`) — this repo's first HTTP-level controller test; the manager/repo layers already have their own coverage and are untouched | FR-007, SC-002 |

---

## Part B — Traceability matrix

### FR → tests

| FR | Tests |
|---|---|
| FR-001, FR-002 (role-scoped nav) | `app-shell.component.test.tsx` (NEW), `use-caller-roles.unit.test.ts` (NEW), `desktop-layout.spec.ts` (UPDATE), `mobile-layout.spec.ts` (UPDATE) |
| FR-003 (remove dead routes/nav entries) | `app-shell.component.test.tsx` (NEW) |
| FR-004 (home landing, no scaffolding/duplicate list) | `home-landing.spec.ts` (NEW), `index.component.test.tsx` (NEW, optional) |
| FR-005–FR-007 (bell, dropdown, view-all/history) | `notification-bell.component.test.tsx` (NEW), `us-notification-bell.spec.ts` (NEW), `volunteer-controller.test.ts` (NEW — backend route contract, C1 fix) |
| FR-008 (no notifications section on dashboard) | `volunteer-dashboard-empty-states.component.test.tsx` (UPDATE), `us3-notifications.spec.ts` → replaced |
| FR-009, FR-010 (tabbed dashboard, default + badge) | `volunteer-dashboard-tabs.component.test.tsx` (NEW/extend) |
| FR-011 (planning step sequence) | `planning-admin.component.test.tsx` (NEW), `us1-admin-plan.spec.ts` (UPDATE — extend) |
| FR-012 (single create-event UI) | `quick-create-event-modal.component.test.tsx` (UPDATE), `single-create-event-ui.spec.ts` (NEW/extend) |
| FR-013 (role-badge identity) | `assignment-chip`, `suggestion-list`, `substitution-picker`, `override-dialog`, `volunteer-card` `.component.test.tsx` (UPDATE/NEW), `us4-roster-publish.spec.ts`, `us5-live-changes.spec.ts`, `a11y-builder.spec.ts` (UPDATE) |
| FR-014 (no regression on 017 DL2/DL3/DL4) | Re-run of `specs/017-scheduling-reshape` E2E suites |

### SC → proof

| SC | Proof |
|---|---|
| SC-001 (zero dead nav entries, all roles) | `app-shell.component.test.tsx` + `desktop-layout.spec.ts`/`mobile-layout.spec.ts` |
| SC-002 (act on notification from bell alone) | `us-notification-bell.spec.ts` |
| SC-003 (single next action visible on planning screen) | `planning-admin.component.test.tsx` + `us1-admin-plan.spec.ts` |
| SC-004 (exactly one create-event UI) | `single-create-event-ui.spec.ts` |
| SC-005 (no two volunteers visually indistinguishable in builder) | `a11y-builder.spec.ts` + component badge tests |
| SC-006 (DL2/DL3/DL4 still pass) | Re-run of `specs/017-scheduling-reshape` suites, unmodified in intent |

---

## Definition of done (per user story, per `agents.local.md`)

For each user story: failing tests exist first (per file/disposition above) → implementation makes them pass → no test was weakened or deleted to achieve green, except a test explicitly identified above as **REPLACE** (its subject was removed, not its assertion weakened) → `pnpm test` (Vitest) and `pnpm test:e2e` (Playwright) both pass → Biome clean.
