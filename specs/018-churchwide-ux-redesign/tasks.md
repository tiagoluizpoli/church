---

description: "Task list for Church-wide UX/IA Redesign (018)"

---

# Tasks: Church-wide UX/IA Redesign

**Input**: Design documents from `/specs/018-churchwide-ux-redesign/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `test-plan.md`)

**Tests**: Explicitly requested (TDD). Every task below that touches a file catalogued in `test-plan.md` Part A/B follows that file's disposition (KEEP / UPDATE / REPLACE / NEW) exactly — do not re-derive disposition from scratch while implementing.

**Organization**: Tasks are grouped by user story (US1–US4, priority order from `spec.md`). Within each story: tests first (must fail red against current code), then implementation (until green), per the `tdd` skill's red→green loop and this repo's rule that code conforms to tests, not the reverse.

**Revision note (2026-07-06, post `/speckit-analyze`)**: Three findings from analysis are folded in here: (1) notification pagination (FR-007) needs a backend contract test plus two small backend implementation tasks (T017-T019 below) that the original draft omitted — the domain layer already supports cursor pagination, but the HTTP route never reads a querystring, has zero existing test coverage, and the generated client is stale (`research.md` R3, corrected); (2) an explicit task now exists for repurposing `notifications-inbox-section.tsx` into a dual-mode shared renderer (T021), which the original draft referenced from other tasks without ever actually scheduling it. All task IDs from T017 onward are renumbered accordingly relative to the pre-analysis draft.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4
- All paths are relative to `apps/web/` unless stated otherwise (backend tasks are marked `apps/server/`)

---

## Phase 1: Setup

- [ ] T001 Confirm baseline: run `bun run test` and `bun run test:e2e` on `develop` before any change, so later red/green comparisons are against a known-good starting point (no code change in this task).

---

## Phase 2: Foundational

**Purpose**: None of the four user stories share a blocking prerequisite — each modifies a distinct primary surface (`app-shell.tsx` nav / notification bell / dashboard tabs / planning flow). The one cross-story touchpoint (US2's bell slotting into US1's restructured `app-shell.tsx`) is handled via priority ordering (US1 ships first) and called out explicitly in US2's dependencies below, not as a separate blocking phase.

**Checkpoint**: No shared setup required — proceed directly to Phase 3 (US1).

---

## Phase 3: User Story 1 — Role-appropriate navigation (Priority: P1) 🎯 MVP

**Goal**: Volunteer-only users see `Dashboard` + `Availability`; Leader/Sub-leader/Admin additionally see `Scheduling`; no nav entry points at a non-existent page; `/` becomes a real landing surface (no ASCII banner, no duplicate builder-events list).

**Independent Test**: Sign in as each role and inspect the rendered nav (desktop sidebar + mobile bottom nav/drawer); visit `/` and confirm no leftover scaffolding. Fully verifiable without US2–US4.

### Tests for User Story 1 (write first, confirm red)

- [ ] T002 [P] [US1] New component test: role-scoped nav rendering in `src/components/app-shell.component.test.tsx` — asserts Volunteer sees exactly `Dashboard`+`Availability`; Leader/Sub-leader/Admin additionally see `Scheduling`; no `Shifts`/`Alerts`/`Profile`/`Todos` render for any role (test-plan.md NEW).
- [ ] T003 [P] [US1] New unit test: `src/shared/hooks/use-caller-roles.unit.test.ts` — covers `CallerNavVisibility` resolution via the reactive-403 pattern (`research.md` R1), including the "assume hidden while resolving" loading state (test-plan.md NEW).
- [ ] T004 [US1] Update `apps/web/tests/mobile-layout.spec.ts` — replace the `count >= 4 // Dashboard, Shifts, Alerts, Profile` assertion (line 26) with a role-scoped count/labels assertion, and assert no dead-link `<a>` targets exist in the bottom nav or drawer (test-plan.md UPDATE).
- [ ] T005 [US1] Extend `apps/web/tests/desktop-layout.spec.ts` — add role-scoped nav-item assertions alongside the existing sidebar collapse/breadcrumb checks (test-plan.md UPDATE — extend).
- [ ] T006 [P] [US1] New E2E: `apps/web/tests/home-landing.spec.ts` — visiting `/` shows no ASCII banner and no duplicate `EventList`/"New Event" affordance, for any role (test-plan.md NEW; covers FR-004, SC-001).

### Implementation for User Story 1

- [ ] T007 [US1] Implement `src/shared/hooks/use-caller-roles.ts` — reactive-403-derived `CallerNavVisibility` (named object param/return type per Constitution VII), reusing the `isForbiddenError` pattern from `src/features/scheduling/components/planning-admin/use-planning-admin.ts` against a lightweight already-role-gated query (`research.md` R1). Makes T003 pass.
- [ ] T008 [US1] Modify `src/components/app-shell.tsx` — replace the single flat `desktopNavItems`/`mobileCoreNavItems` arrays with role-derived sets from `useCallerRoles()`: Volunteer base (`Dashboard`, `Availability`); `+ Scheduling` when `canSeeScheduling`. Remove `Shifts`, `Alerts`, `Profile`, `Todos` entries entirely. Reserve (but do not yet fill) a top-bar and mobile-top-header slot for the notification bell (US2 fills it). Makes T002, T004, T005 pass.
- [ ] T009 [P] [US1] Delete `src/routes/todos.tsx` and remove its nav reference (already covered by T008); delete any now-orphaned `Shifts`/`Alerts`/`Profile` route stubs if present.
- [ ] T010 [US1] Modify `src/routes/index.tsx` — remove the ASCII `TITLE_TEXT` banner and the `<EventList />` render; replace with a real landing surface appropriate to the caller's role (reuse `useCallerRoles()` from T007 for any role-conditional content; the exact positive content is an implementation choice — see `spec.md` Assumptions). Makes T006 pass.
- [ ] T011 [US1] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations.

**Checkpoint**: User Story 1 fully functional and independently testable — role-scoped nav, no dead links, clean home surface.

---

## Phase 4: User Story 2 — Single notification center (Priority: P2)

**Goal**: One notification bell in the top bar (desktop) and mobile top header, unread count, dropdown of recent unread-first items with working deep links, "View all" → full `/notifications` history. Dashboard no longer has a notifications section.

**Independent Test**: Trigger a notification, confirm it surfaces only via the bell (not the dashboard), confirm deep-link and full-history behavior. Independently verifiable once US1's `app-shell.tsx` restructuring (T008) has landed, since the bell occupies the slot T008 reserves.

**Dependency**: Requires T008 (US1) complete — the bell slots into the app-shell topbar/mobile-header structure US1 establishes. All other US2 work is independent of US1's nav-set logic.

### Tests for User Story 2 (write first, confirm red)

- [ ] T012 [P] [US2] New component test: `src/components/notification-bell/notification-bell.component.test.tsx` — unread count badge, dropdown open/close, item click calls the existing deep-link resolver, "View all" link targets `/notifications` (test-plan.md NEW).
- [ ] T013 [US2] Update `src/__tests__/volunteer-dashboard/volunteer-dashboard-empty-states.component.test.tsx` — remove all notifications-empty-state and DOM-order assertions involving notifications; the section no longer exists on the dashboard (test-plan.md UPDATE, partial — dashboard-tab assertions land in US3).
- [ ] T014 [US2] Update `src/__tests__/volunteer-dashboard/notifications-inbox-section.component.test.tsx` — add cases for both consumption modes: bounded N-item list (bell dropdown) and full paginated list (`/notifications` page) (test-plan.md UPDATE).
- [ ] T015 [P] [US2] New E2E: `apps/web/tests/volunteer-dashboard/us-notification-bell.spec.ts` — full journey: trigger notification → bell shows unread count → open dropdown → click item → correct context opens → "View all" → `/notifications` paginates through history. Replaces the deleted `us3-notifications.spec.ts` (test-plan.md NEW/REPLACE).
- [ ] T016 [US2] Delete `apps/web/tests/volunteer-dashboard/us3-notifications.spec.ts` — its subject (`/dashboard?section=notifications` inline inbox) no longer exists; superseded by T015 (test-plan.md REPLACE).

### Backend test for User Story 2 (write first, confirm red — added post-`/speckit-analyze`, finding C1)

- [ ] T017 [US2] New backend contract test: `apps/server/src/api/controllers/volunteer-controller.test.ts` (Fastify `inject`) — asserts `GET /notifications?cursor=X&limit=Y` passes both through to `volunteerManager.getNotifications` and the response includes `nextCursor` when more pages exist. This repo's first HTTP-level controller test (zero existing coverage at this layer, verified) — the manager/repo layers already have their own tests and are untouched. (test-plan.md NEW, L-http)

### Implementation for User Story 2

> **T018-T019 added post-`/speckit-analyze`** (finding C1): the domain/manager layer already fully supports cursor pagination — `GetNotificationsInput.cursor/limit`, `NotificationListResult.nextCursor`, and `notificationListResponseSchema` all already exist in `apps/server`. The gap is purely the HTTP route + generated client, not the client hook. Do these two before T020, or T020/T015 cannot pass.

- [ ] T018 [US2] `apps/server/src/api/controllers/volunteer-controller.ts` — add a querystring Zod schema (`cursor?: string`, `limit?: number`) to the `/notifications` GET route and pass both through to the existing `this.volunteerManager.getNotifications({ volunteerId, churchId, cursor, limit })` call (the manager already accepts these — verified in `db-volunteer-manager.ts:933-947`). No manager/repo change needed. Makes T017 pass.
- [ ] T019 [US2] Regenerate the orval client (repo's orval command) so `volunteerApi.getNotifications({ cursor?, limit? })` and `GetNotifications200.nextCursor` exist in `apps/web/src/infrastructure/api/`. Confirm `churchAPI.schemas.ts` picks up `nextCursor`. Depends on T018.
- [ ] T020 [US2] Complete the cursor pagination in `src/features/volunteers/hooks/use-notification-inbox.ts` — wire real `loadMore` (currently a no-op) using the now-available `cursor`/`limit` params (T018-T019), and stop overwriting `nextCursor` on every first-page fetch. Makes T014's full-list case and T015's pagination assertion pass. Depends on T019.
- [ ] T021 [US2] Adapt `src/features/volunteers/components/notifications-inbox-section.tsx` into a shared, dual-mode list renderer: bounded-N-items mode (for the bell dropdown) and full-paginated mode (for `/notifications`), per `plan.md`'s REPURPOSE note. Makes T014 fully pass (added post-`/speckit-analyze`, finding H1 — this task was previously referenced by other tasks below without ever being scheduled).
- [ ] T022 [US2] Create `src/components/notification-bell/notification-bell.tsx` (+ dropdown subcomponent) — consumes `useNotificationInbox` (bounded slice per `data-model.md`'s `NotificationBellViewModel`), reuses T021's shared renderer in bounded mode. Makes T012 pass.
- [ ] T023 [US2] Wire the bell into `src/components/app-shell.tsx`'s reserved topbar and mobile-top-header slots (from T008).
- [ ] T024 [US2] Create `src/routes/notifications.tsx` — full history route reusing `use-notification-inbox.ts` (T020) and T021's shared renderer in paginated mode.
- [ ] T025 [US2] Modify `src/features/volunteers/components/volunteer-dashboard.tsx` — remove `NotificationsInboxSection` and its dialog/state wiring entirely. Makes T013 pass.
- [ ] T026 [US2] Run `bun run check-types && bunx biome check .` on all files touched in this phase (both `apps/web` and `apps/server`); fix violations.

**Checkpoint**: User Stories 1 AND 2 both work independently — nav is role-scoped, notifications live solely in the bell.

---

## Phase 5: User Story 3 — Organized volunteer dashboard (Priority: P3)

**Goal**: `/dashboard` presents Upcoming Assignments (default), Availability Needed (with outstanding-count badge), and Ministry Schedule as switchable tabs, not a flat stack.

**Independent Test**: Open `/dashboard`, confirm default tab, badge visibility, and that Ministry Schedule no longer shares vertical space with the others. Independently testable once US2 (T025) has removed the notifications section — the tab set is exactly the 3 remaining sections.

**Dependency**: Requires T025 (US2) complete — tabs replace the stack that remains *after* notifications is removed, not the original 4-section stack.

### Tests for User Story 3 (write first, confirm red)

- [ ] T027 [P] [US3] New/extend component test: `src/__tests__/volunteer-dashboard/volunteer-dashboard-tabs.component.test.tsx` — default tab is Upcoming Assignments; Availability Needed shows an outstanding-count badge without switching; Ministry Schedule renders only when its tab is active (test-plan.md NEW).
- [ ] T028 [US3] Update `src/__tests__/volunteer-dashboard/ministry-schedule-section.component.test.tsx` — verify no test assumes a specific sibling-section DOM position; adjust wrapper to render inside a tab panel (test-plan.md UPDATE — verify).
- [ ] T029 [US3] Update `src/__tests__/volunteer-dashboard/upcoming-assignments-section.component.test.tsx` — same as T028 for the default tab (test-plan.md UPDATE — verify).
- [ ] T030 [US3] Update `src/__tests__/volunteer-dashboard/offline-and-refresh-ui.component.test.tsx` — confirm the offline/cached-data banner still renders correctly above the tab set (test-plan.md UPDATE — verify).
- [ ] T031 [P] [US3] Update `apps/web/tests/volunteer-dashboard/us1-availability.spec.ts` and `us2-assignments.spec.ts` — `?section=` deep-links must switch to the corresponding tab, not scroll to a stacked section (test-plan.md UPDATE).
- [ ] T032 [P] [US3] Update `apps/web/tests/volunteer-dashboard/us4-ministry-schedule.spec.ts` — confirm deep-link/section-param still resolves to the Ministry Schedule tab (test-plan.md UPDATE — verify).
- [ ] T033 [US3] Update `apps/web/tests/volunteer-dashboard/us5-offline.spec.ts` — confirm all 3 remaining tabs (not 4 sections) stay readable offline (test-plan.md UPDATE — verify).

### Implementation for User Story 3

- [ ] T034 [P] [US3] Add shadcn `Tabs` primitive to `packages/ui/src/components/tabs.tsx` via the standard shadcn CLI flow (`research.md` R2 — do not hand-roll; none exists in `packages/ui` today).
- [ ] T035 [US3] Modify `src/features/volunteers/components/volunteer-dashboard.tsx` — replace the `<div className="space-y-4">` stack with `Tabs` (T034): `upcoming-assignments` (default), `availability-needed` (badge = outstanding count), `ministry-schedule` (`data-model.md`'s `DashboardTabId`). Makes T027–T030 pass.
- [ ] T036 [US3] Update `dashboard.tsx`'s `?section=` query-param handling to map onto the new `DashboardTabId` values instead of scroll targets. Makes T031–T033 pass.
- [ ] T037 [US3] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations.

**Checkpoint**: User Stories 1–3 all independently functional — nav, notifications, and dashboard are fully redesigned.

---

## Phase 6: User Story 4 — Guided scheduling/planning flow (Priority: P4)

**Goal**: Planning-cycle screen shows only the step relevant to the cycle's state; exactly one create-event UI exists product-wide; the schedule builder disambiguates Leader vs. Sub-leader identity with a role badge.

**Independent Test**: Walk a cycle from creation through lock and confirm only the relevant step renders each time; confirm one create-event UI reachable everywhere; confirm two same-truncating volunteers show distinct role badges in the builder. Fully independent of US1–US3 (different surface entirely), though US1 (T010) already removed `EventList` from `/` — this story's create-event work is scoped to `/scheduling/` itself.

### Tests for User Story 4 (write first, confirm red)

- [ ] T038 [P] [US4] New component test: `src/features/scheduling/components/planning-admin.component.test.tsx` — no-cycle state shows only `CreateCycleCard`; cycle-selected state shows template/review steps with `CycleListCard` demoted to a secondary panel; locked-cycle state is read-only (test-plan.md NEW — zero existing coverage).
- [ ] T039 [US4] Update `src/features/scheduling/components/quick-create-event-modal.component.test.tsx` — confirm it is reachable as the sole create-event UI; no second creation form exists elsewhere (test-plan.md UPDATE — verify).
- [ ] T040 [P] [US4] New component test: `src/features/scheduling/components/builder/volunteer-card.component.test.tsx` — role badge renders and disambiguates two identically-truncating names (test-plan.md NEW — no file exists today).
- [ ] T041 [P] [US4] Update `src/features/scheduling/components/builder/assignment-chip.component.test.tsx`, `suggestion-list.component.test.tsx`, `substitution-picker.component.test.tsx`, `override-dialog.component.test.tsx` — add role-badge assertions to each (test-plan.md UPDATE, 4 files).
- [ ] T042 [US4] Update `apps/web/tests/scheduling/us1-admin-plan.spec.ts` — extend to assert step-sequence gating (only relevant step visible at each cycle state) and confirm the leader's `planning-cycle-option` locator remains reachable in the demoted secondary panel (test-plan.md UPDATE — verify).
- [ ] T043 [P] [US4] New/extend E2E: `apps/web/tests/scheduling/single-create-event-ui.spec.ts` — confirm exactly one create-event interface is reachable from every entry point that can create an event (test-plan.md NEW/extend; covers FR-012, SC-004).
- [ ] T044 [P] [US4] Update `apps/web/tests/scheduling/us4-roster-publish.spec.ts` and `us5-live-changes.spec.ts` — both already seed a Leader + Sub-leader identity; add the role-badge disambiguation assertion to each (test-plan.md UPDATE).
- [ ] T045 [US4] Update `apps/web/tests/scheduling/a11y-builder.spec.ts` — add an accessible-name assertion proving two differently-rôled volunteers are not screen-reader-identical (test-plan.md UPDATE; closes the confirmed a11y bug from the `/impeccable` critique).

### Implementation for User Story 4

- [ ] T046 [US4] Modify `src/features/scheduling/components/planning-admin.tsx` — replace the unconditional 2×2 grid with a `PlanningStep`-driven conditional render (`data-model.md`): `create-cycle` → `CreateCycleCard` only; `template-and-review` → `TemplateManagerCard` + `CycleReviewCard` with `CycleListCard` demoted to a secondary panel; `locked-review` → read-only. Derive `PlanningStep` from existing `use-planning-admin.ts` state (`research.md` R4) — no new persisted field. Makes T038, T042 pass.
- [ ] T047 [US4] Modify `src/features/scheduling/components/event-list.tsx` and `src/features/scheduling/components/planning-admin/*` as needed so exactly one create-event interface exists — either the planning flow's inline form delegates to `QuickCreateEventModal`, or is removed in favor of it. Makes T039, T043 pass.
- [ ] T048 [P] [US4] Modify `src/features/scheduling/components/builder/volunteer-card.tsx` — add `AssigneeIdentityBadge` (`data-model.md`): role badge/chip always visible, full name+role on hover/expand. Makes T040 pass.
- [ ] T049 [US4] Apply the same badge to `assignment-chip.tsx`, `suggestion-list.tsx`, `substitution-picker.tsx`, `override-dialog.tsx` (wherever `formatVolunteerName` is rendered) — reuse the component from T048 rather than duplicating badge markup. Makes T041, T044, T045 pass.
- [ ] T050 [US4] Run `bun run check-types && bunx biome check .` on all files touched in this phase; fix violations.

**Checkpoint**: All four user stories independently functional — full IA redesign complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T051 Re-run the full `specs/017-scheduling-reshape` Playwright suite (`apps/web/tests/scheduling/*.spec.ts`) end-to-end against the redesigned screens — confirm all DL2/DL3/DL4 scenarios still pass (FR-014, SC-006).
- [ ] T052 Run `quickstart.md` manually end-to-end (all 5 sections) as a final human sanity check.
- [ ] T053 Update the `<!-- SPECKIT START/END -->` pointer in `CLAUDE.md` if a subsequent feature has started (no-op if 018 is still current).
- [ ] T054 [P] Full-suite run: `bun run test` (Vitest, all layers) and `bun run test:e2e` (Playwright, full suite) both green; `bunx biome check .` clean repo-wide.
- [ ] T055 Confirm no test file was weakened or deleted outside what `test-plan.md` marked **REPLACE** (T016 only) — spot-check `git diff` on every test file touched across T002–T050 against its `test-plan.md` disposition.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Empty by design (see note above) — proceed directly to US1.
- **US1 (Phase 3)**: No dependencies on other stories. Ships first (P1/MVP).
- **US2 (Phase 4)**: Depends on US1's `app-shell.tsx` restructuring (T008) for the bell's topbar/mobile-header slot. T017→T018→T019→T020 form a strict test-then-backend-then-client chain (added post-analysis). All other US2 work is independent of US1's nav-set logic.
- **US3 (Phase 5)**: Depends on US2's removal of the dashboard notifications section (T025) — the tab set is the 3 sections that remain afterward.
- **US4 (Phase 6)**: Independent of US1–US3 (different surface); only soft-overlaps with US1's home-page cleanup (T010), which already removed `EventList` from `/` — US4 does not re-touch `/`.
- **Polish (Phase 7)**: Depends on all four stories being complete.

### Within Each User Story

- Tests written and confirmed red before implementation (test tasks precede implementation tasks in every phase above).
- Shared components (e.g., T048's badge, T021's shared list renderer) built once, then applied everywhere needed (T049, T022/T024) — not duplicated per call site.
- Story complete (checkpoint reached) before moving to the next priority, though stories may be staffed in parallel once their specific dependency (if any) is satisfied.

### Parallel Opportunities

- T002, T003, T006 (US1 tests, different files) — parallel.
- T012, T015 (US2 tests, different files) — parallel.
- T027, T031, T032 (US3 tests, different files) — parallel.
- T038, T040, T041, T043, T044 (US4 tests, different files) — parallel.
- T017 → T018 → T019 → T020 (US2 backend-then-client chain) — sequential, NOT parallel.
- T048 must complete before T049 (T049 reuses T048's component) — not parallel with each other.

---

## Parallel Example: User Story 1

```bash
# Launch all independent US1 tests together:
Task: "New component test: role-scoped nav rendering in src/components/app-shell.component.test.tsx"
Task: "New unit test: src/shared/hooks/use-caller-roles.unit.test.ts"
Task: "New E2E: apps/web/tests/home-landing.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (empty) → Phase 3 (US1).
2. **STOP and VALIDATE**: role-scoped nav + clean home surface, independently.
3. Demo/ship if ready — US1 alone already resolves the most visible complaint (dead links, leftover scaffolding) for the whole congregation.

### Incremental Delivery

1. US1 → validate → ship (MVP).
2. US2 (needs US1's app-shell slot; do the T017→T018→T019→T020 test-then-backend-then-client chain first within this story) → validate → ship.
3. US3 (needs US2's dashboard cleanup) → validate → ship.
4. US4 (independent) → validate → ship — can be reordered earlier/parallel to US2/US3 if staffed separately, since it doesn't depend on them.
5. Phase 7 polish/regression pass once all four are in.
