---
description: "Task list for Event Builder (Cycle-Centric) implementation"
---

# Tasks: Event Builder (Cycle-Centric)

**Input**: Design documents from `specs/023-event-builder/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/leader-rostering-endpoints.md](./contracts/leader-rostering-endpoints.md)

**Tests**: INCLUDED — mandated by research.md R8 and `agents.local.md` (Dockerized PostgreSQL integration tests + two-church A/B isolation for every new repository method; per-phase quality-gate loop). Not optional for this feature.

**Organization**: Grouped by the six user stories from spec.md, in priority order (US1/US2 = P1, US3/US4 = P2, US5/US6 = P3). Cutover ordering follows research.md R3: backend → new route additively → repoint entry → migrate e2e → delete legacy.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 for user-story tasks; Setup/Foundational/Polish carry no story label
- Every task names exact file path(s)

## Layer note (per phase)

Each backend endpoint threads four layers following the `getCycleParticipation`/`publishParticipation` precedents: **domain contract type → Drizzle repository → application manager → API DTO+controller**, then **orval regen**. Every new query is church-isolated (R2/R8). Each phase closes with the `agents.local.md` gate loop (`bun run check` / `check-types` / `test` / `test:e2e`) + `/review`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm environment and references before code

- [ ] T001 Verify branch `023-event-builder`, run `bun install`, bring up Dockerized Postgres (`docker compose up -d`) for integration tests
- [ ] T002 [P] Read [legacy-builder-retirement-inventory](../../manual-planning/0001-volunteer-scheduling/research/legacy-builder-retirement-inventory.md) for the file-by-file reuse/rebuild/delete classification used throughout Phases US1/US4
- [ ] T003 [P] Confirm the approved layout reference (prototype variant G) and existing atomic schemas (`assignmentResponseSchema`, `eligibleVolunteerResponseSchema` `apps/server/src/api/dtos/rostering.dto.ts:14`, `shiftResponseSchema`/`shiftRequirementResponseSchema`/`participationResponseSchema` in `participation.dto.ts`) plus the `rbacGuard.canManageMinistry` guard exist and are unchanged

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scaffolding every story builds on

**⚠️ CRITICAL**: Complete before any user-story phase

- [ ] T004 Create shared DTO file `apps/server/src/api/dtos/cycle-builder.dto.ts` composing existing atomic schemas: `cycleBuilderShiftViewSchema` / `cycleBuilderSlotViewSchema` / `cycleBuilderEventViewSchema` / `cycleBuilderResponseSchema`, plus `publishCycleBodySchema` (mirrors `publishParticipationBodySchema`) and `publishCycleResponseSchema` (per contracts/ §1 & §3) — no new leaf shapes, all named types (constitution VII)
- [ ] T005 Scaffold the canvas host route `apps/web/src/routes/scheduling/rostering/$ministryId/$cycleId.tsx` (ministry-first) as a shell with a loader stub — shared render host for US1/US2/US3/US6
- [ ] T006 [P] Set up the LeaderRosteringController integration-test harness against Dockerized Postgres with a two-church (A/B) fixture (R8) reused by every new-endpoint test below

**Checkpoint**: Shared DTO + route shell + test harness ready

---

## Phase 3: User Story 1 — Staff a whole cycle in one canvas (Priority: P1) 🎯 MVP

**Goal**: One canvas shows every event/slot/shift for a ministry+cycle with staffing progress; leader assigns, reassigns (swap vs assign-both), removes, and drafts persist.

**Independent Test**: Open the builder for a ministry+cycle with availability fired, assign volunteers across ≥2 events, reassign one, reload — draft persists; no per-event navigation.

### Tests for User Story 1

- [ ] T007 [P] [US1] Integration test `getCycleBuilderData` in `apps/server/…/leader-rostering-controller.integration.test.ts`: uniform shape, `assignments: []` for zero-assignment shifts, `eligibleVolunteers: []` for published participations, plus two-church A/B isolation (R8). **SC-002 guard**: assert the whole cycle loads in a **single** batched request and that eligible-volunteers are fetched **without N+1** (query-count spy / PG statement-log assertion via the T006 harness) — one batched read replaces the three legacy loads
- [ ] T009a [P] [US1] **FR-006 guard** test in `apps/web/…/builder/*.component.test.tsx` + `apps/server/…`: assert the builder route/canvas wires **no** slot/shift/requirement mutation (structure is read-only) — no create/edit/delete-structure call exists on the builder path, and no such server endpoint is added by this feature
- [ ] T008 [P] [US1] Component test: cycle board renders event lanes → slots → shifts with staffed-vs-required progress, in `apps/web/…/builder/*.component.test.tsx`
- [ ] T009 [P] [US1] E2E in `apps/web/e2e/…`: open builder, assign across 2 events, reassign one, reload → draft persists

### Implementation — backend read (R1)

- [ ] T010 [US1] Repository **Query A** (church-isolated events→slots→shifts→requirements→assignments aggregation for `(ministryId, cycleId)`) in `apps/server/src/infrastructure/repositories/drizzle-ministry-participation.repository.ts`; add its input/output contract types to `apps/server/src/domain/contracts/infrastructure/ministry-participation.repository.ts`
- [ ] T011 [US1] Repository **Query B** (single batched eligible-volunteers read over all shifts at once, skipped for published participations) in the same repository, reusing the eligibility/availability logic behind `listEligibleVolunteers`
- [ ] T012 [US1] Manager `getCycleBuilderData({ churchId, cycleId, ministryId, userId })` stitching Query A+B in `apps/server/src/application/db-participation-manager.ts`; add the signature/view types to `apps/server/src/domain/contracts/application/participation-manager.ts`
- [ ] T013 [US1] Controller route `GET /leader/cycles/:cycleId/builder` (`operationId: getCycleBuilderData`, `canManageMinistry` guard, `cycleBuilderResponseSchema`) in `apps/server/src/api/controllers/leader-rostering-controller.ts`
- [ ] T014 [US1] Regenerate the orval client (`apps/web/src/infrastructure/api/`) — do not hand-edit generated files

### Implementation — frontend canvas (R2/R3)

- [ ] T015 [P] [US1] Verify the 7 reuse-as-is presentational components drop into the canvas unchanged (`assignee-identity-badge`, `assignment-chip`, `override-dialog`, `staffing-meter`, `suggestion-list`, `volunteer-card`; `audit-log-panel` shell only) in `apps/web/src/features/scheduling/components/builder/`
- [ ] T016 [US1] Rebuild the 10 grid-structural components for the cycle board (`schedule-builder.tsx` root → `ministryId`+`cycleId`, `schedule-builder-ready.tsx`, `builder-grid.tsx` → cycle lanes, `slot-row.tsx` (assignment-only, inline-edit dropped), `builder-header.tsx`, `empty-builder-state.tsx` → cycle-empty, `requirement-cell.tsx`, `builder-types.ts`, `use-schedule-builder-controller.ts`(+`.types.ts`) dropping `useSlotManagement`, `use-schedule-builder-derived-data.ts`, `volunteer-pool-sidebar.tsx` → cycle-wide rail) in `apps/web/src/features/scheduling/components/builder/`
- [ ] T017 [US1] Rewire the 3 pool-dependent components (`assignment-picker.tsx`, `substitution-picker.tsx`, `role-count-control.tsx`) to the cycle-wide eligible-per-shift pool from `getCycleBuilderData`
- [ ] T018 [US1] Wire the `$ministryId/$cycleId.tsx` route to `getCycleBuilderData`; render date filters + cycle-level staffing orientation (FR-002)
- [ ] T019 [US1] Implement assign / remove / reassign against the existing single-assignment endpoints (`createParticipationAssignment`, `deleteParticipationAssignment`, `reassignParticipationAssignment`), incl. the explicit swap-vs-assign-both choice when the volunteer is already assigned (FR-007)
- [ ] T020 [US1] Searchable volunteer rail with click-to-select and drag-to-assign onto shifts (FR-008)
- [ ] T021 [US1] Run the `agents.local.md` gate loop + `/review` on modified files; fix all findings before proceeding

**Checkpoint**: US1 fully functional — cycle-wide assignment works end to end (MVP).

---

## Phase 4: User Story 2 — Publish the whole cycle at once (Priority: P1)

**Goal**: One action publishes every participation in the cycle atomically, with confirm-below-full; reassignment still allowed after publish.

**Independent Test**: With a shift left below full, Publish → below-full confirmation → confirm → every participation `published` in one action; reopen and reassign a volunteer.

### Tests for User Story 2

- [ ] T022 [P] [US2] Integration test `publishCycle`: all-or-nothing transaction, below-full-without-confirm returns `belowFull: true` with no state change, confirm path publishes all, two-church isolation (R8)
- [ ] T023 [P] [US2] E2E: below-full → confirm → all participations published; reassign after publish permitted

### Implementation (R7)

- [ ] T024 [US2] Repository batched publish inside a single `db.transaction()` over all `(cycleId, ministryId)` participations in `drizzle-ministry-participation.repository.ts` (all-or-nothing)
- [ ] T025 [US2] Manager `publishCycle({ churchId, cycleId, ministryId, userId, confirmBelowFull })` reusing the existing per-participation publish rule + below-full signal, in `db-participation-manager.ts` (+ contract types)
- [ ] T026 [US2] Controller route `POST /leader/cycles/:cycleId/publish` (`canManageMinistry`, `publishCycleBodySchema`/`publishCycleResponseSchema`) in `leader-rostering-controller.ts`; regenerate orval client
- [ ] T027 [US2] Publish UI in the canvas route: single Publish action + below-full confirmation dialog (shadcn), re-calling with `confirmBelowFull: true` (FR-021/FR-022)
- [ ] T028 [US2] Gate loop + `/review`

**Checkpoint**: US1 + US2 = a leader can staff and ship a whole cycle.

---

## Phase 5: User Story 3 — Ranked recommendations (Priority: P2)

**Goal**: Up to 5 plain-language, fairly-ordered recommendations per shift/role with Needs-response + Conflict-options grouping and explicit Accept; nothing auto-assigns.

**Independent Test**: For a shift with mixed availability/history, verify ordering, the two groupings, override-reason on conflict, and that Accept assigns exactly the top candidate.

**Note**: Builds on US1's canvas + `getCycleBuilderData` (recommendations compute from already-fetched data — no new endpoint).

### Tests for User Story 3

- [ ] T029 [P] [US3] Component test: safe-candidate ordering (longest-since-last → fewest-in-cycle → alpha), "Needs response" vs "Conflict options" grouping, Accept assigns top only

### Implementation (R4)

- [ ] T030 [US3] Ranking on already-fetched builder data: hard eligibility filter + exact-shift availability evaluation; safe ordering (longest time since last active assignment → fewest active cycle assignments → stable alphabetical), same-day non-overlapping ranks lower with workload note — in `apps/web/src/features/scheduling/components/builder/` (recommendation derivation)
- [ ] T031 [US3] Group pending → "Needs response", unavailability/overlap → "Conflict options"; assigning a conflict option requires the existing override-reason flow (`override-dialog.tsx`)
- [ ] T032 [US3] Render up to 5 recommendations, top highlighted with explicit Accept, no auto-assign, plain language (no numeric scores)
- [ ] T033 [US3] Fairness scope default = whole cycle; add the Unleash flag path for temporary ministry-only history (active = draft/pending/confirmed only)
- [ ] T034 [US3] Recompute from current draft after each mutation; revalidate backend data after mutations, on window focus, and on ~30s HTTP refresh while open
- [ ] T035 [US3] Gate loop + `/review`

**Checkpoint**: Assignment is assisted and fair.

---

## Phase 6: User Story 4 — Entry point + gating + legacy retirement (Priority: P2)

**Goal**: Cycle rows get an **Assign** button gated on any-availability-fired; legacy Builder Events entry + per-event route retired.

**Independent Test**: Row with ≥1 availability fired → **Assign** enabled → lands in builder; no availability → disabled with unlock copy; published cycle → still enabled; old "Builder Events" entry + per-event route gone.

### Tests for User Story 4

- [ ] T036 [P] [US4] Integration test `availabilityFiredForAny`: `firedOrLaterCount > 0`, and `eventCount === 0 ⇒ false` (vacuous-truth guard), in the participation cycle-summary test
- [ ] T037 [P] [US4] E2E: **Assign** enabled on any-fired, disabled copy "Unlocks once availability has fired for this cycle" otherwise, enabled on fully-published; legacy entries/routes unreachable

### Implementation — derived field (R6)

- [ ] T038 [US4] Domain: `aggregateCycleTailoringStatus` emits `availabilityFiredForAny` in `apps/server/src/domain/entities/ministry-participation.ts` (added to `CycleTailoringStatusResult`)
- [ ] T039 [US4] Propagate the field: repository cycle-summary view (`ministry-participation.repository.ts`) → manager view (`participation-manager.ts`) → `participation.dto.ts` schema (`:123`) + mapper (`:205`)
- [ ] T040 [US4] Regenerate orval client; surface `availabilityFiredForAny` in `apps/web/src/features/scheduling/components/tailoring/cycle-list.utils.ts` view-model

### Implementation — entry + retirement (R3/R6)

- [ ] T041 [US4] `ministry-cycle-list.tsx`: replace "Builder Events" with **Assign** → `/scheduling/rostering/$ministryId/$cycleId`, gate on `availabilityFiredForAny`, disabled copy + `ministry-cycle-assign-{link,button}-${id}` testids, keep enabled when published
- [ ] T042 [US4] Repoint the other 3 entry points off `/scheduling/builder-events` per the R3 inventory
- [ ] T043 [US4] Migrate the 5 legacy builder e2e specs to the new route + testids
- [ ] T044 [US4] Delete the legacy routes: `scheduling/builder-events.tsx` + `EventList`, `scheduling/events/$eventId/builder.tsx`, and the **entire cycle-first legacy subtree** `scheduling/rostering/$cycleId/**` (the orphaned `$cycleId/$ministryId/$participationId.tsx` route + `RosterBuilderPage` and its now-empty intermediate `$cycleId/` / `$cycleId/$ministryId/` directories) — leaving only the new ministry-first `rostering/$ministryId/$cycleId.tsx`. Also delete the 4 slot-management `builder/` files and `mobile-interstitial.tsx`
- [ ] T045 [US4] Gate loop + `/review`

**Checkpoint**: The builder is discoverable and the legacy flow is gone.

---

## Phase 7: User Story 5 — Cycle-wide audit trail (Priority: P3)

**Goal**: On-demand audit panel shows the whole cycle's assignment changes in one batched read.

**Independent Test**: After several assignment/override actions, open the panel → single cycle-wide list (actor/action/timestamp/reason + volunteer name joined client-side), lazy on open.

### Tests for User Story 5

- [ ] T046 [P] [US5] Integration test `getCycleAuditLog`: cycle-wide items for `(cycleId, ministryId)`, two-church isolation (R8)

### Implementation (R5)

- [ ] T047 [US5] Repository `listByCycle(churchId, cycleId, ministryId)` (church-isolated) in `apps/server/src/infrastructure/repositories/drizzle-assignment-audit.repository.ts`; add the method to `apps/server/src/domain/contracts/infrastructure/assignment-audit.repository.ts`
- [ ] T048 [US5] Manager `listAuditLogForCycle({ churchId, cycleId, ministryId })` in `apps/server/src/application/db-assignment-manager.ts` (+ contract type in `assignment-manager.ts`)
- [ ] T049 [US5] Controller route `GET /leader/cycles/:cycleId/audit` reusing `auditListResponseSchema` (no new DTO) in `leader-rostering-controller.ts`; regenerate orval client
- [ ] T050 [US5] Rewire `audit-log-panel.tsx`: replace the `Promise.all(getAssignmentAudit)` N+1 with one `getCycleAuditLog` call (query key `['cycle-audit', cycleId, ministryId]`, `enabled: open`); resolve `volunteerName` by joining `assignmentId` against already-loaded builder assignments
- [ ] T051 [US5] Gate loop + `/review`

**Checkpoint**: Accountability view works without N+1.

---

## Phase 8: User Story 6 — Mobile parity (Priority: P3)

**Goal**: Genuinely responsive canvas — view/assign/publish on a phone, no interstitial.

**Independent Test**: Narrow viewport → full canvas usable; board scrolls horizontally; volunteer rail stacks below; no "continue on desktop" interstitial.

### Tests for User Story 6

- [ ] T052 [P] [US6] E2E on a narrow viewport: view + assign + publish succeed; board scrolls horizontally; rail stacks below; no interstitial present

### Implementation (R2/R6)

- [ ] T053 [US6] Responsive cycle board: horizontal scroll when wider than viewport; volunteer rail stacks below the board (FR-031/FR-032) in the canvas components
- [ ] T054 [US6] Confirm `mobile-interstitial.tsx` is deleted (T044) and no code path renders it; ensure touch-sized controls on the canvas
- [ ] T055 [US6] Gate loop + `/review`

**Checkpoint**: All six stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T056 [P] Run [quickstart.md](./quickstart.md) validation end to end (build order + per-story smoke)
- [ ] T057 [P] Update any docs/legacy references pointing at the retired `/scheduling/builder-events` flow
- [ ] T058 Full safeguard suite (`bun run check` / `check-types` / `test` / `test:e2e`) green + final `/review` across the whole diff

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories** (shared DTO T004, route shell T005, test harness T006).
- **US1 (P3)** → after Foundational. The MVP; every other frontend story renders inside US1's canvas.
- **US2 (P4)** → backend (T024–T026) is independent of US1 and can run in parallel with US1 backend; the publish **UI** (T027) depends on US1's canvas route.
- **US3 (P5)** → depends on US1 (recommendations compute from `getCycleBuilderData` + render in the canvas).
- **US4 (P6)** → derived-field backend (T038–T040) is independent; the **Assign** button (T041) and legacy deletion (T044) depend on US1's route existing (navigation target) — retirement is last per the R3 cutover.
- **US5 (P7)** → panel rewire (T050) depends on US1's loaded assignments; the endpoint (T047–T049) is independent.
- **US6 (P8)** → depends on US1's canvas.
- **Polish (P9)** → after all targeted stories.

### Honest independence note

The six stories are **layers on one canvas**, not fully orthogonal features. Their *backend endpoints* are independently buildable/testable in parallel; their *UI* mostly depends on US1. The clean MVP boundary is **US1 + US2** (staff and publish a cycle).

### Within each story

Domain type → repository → manager → DTO/controller → orval regen → UI; tests written to fail first (R8); story-complete before the next priority.

---

## Parallel opportunities

- Setup: T002, T003 in parallel.
- Foundational: T006 in parallel with T004/T005.
- **Backend endpoints across stories can be built in parallel once Foundational is done**: US1 read (T010–T013), US2 publish (T024–T026), US4 field (T038–T039), US5 audit (T047–T049) touch different methods/files — assign to different developers.
- Within a story, all `[P]` test tasks run together (e.g., T007+T008+T009).

### Parallel example — backend fan-out after Foundational

```bash
Task: "US1 getCycleBuilderData repository Query A/B + manager + controller"     # T010–T013
Task: "US2 publishCycle batched transaction + manager + controller"            # T024–T026
Task: "US4 availabilityFiredForAny domain + propagation"                       # T038–T039
Task: "US5 getCycleAuditLog repository + manager + controller"                 # T047–T049
```

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 US1 (canvas) → **STOP and validate** cycle-wide assignment independently.
3. Phase 4 US2 (publish) → a leader can now staff **and** ship a cycle. **Demo-ready MVP.**

### Incremental delivery

US3 (recommendations) → US4 (entry + retire legacy) → US5 (audit) → US6 (mobile), each tested independently and closed with the gate loop + `/review`. Retirement (US4/T042–T044) lands only after the new route is proven, per the R3 cutover.

---

## Notes

- `[P]` = different files, no incomplete dependency; `[Story]` = traceability to spec.md.
- Every new query is church-isolated; every new repository method carries a two-church A/B integration test (R8) — non-negotiable.
- No schema migration; `packages/db` untouched. `availabilityFiredForAny` is computed, not stored.
- Reuse existing single-assignment mutation endpoints unchanged — only the batched **read** and batched **publish** are new endpoints (plus the audit read).
- Commit after each task or logical group (conventional commits); run the gate loop before declaring any phase complete.
