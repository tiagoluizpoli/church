---
description: "Task list for Scheduling Reshape (017)"
---

# Tasks: Scheduling Reshape — Church-Owned Cycles, Templates & Shifts

**Input**: Design documents from `/specs/017-scheduling-reshape/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md, test-plan.md

**Tests**: REQUIRED for this feature. Tests are a primary safeguard (user mandate + `agents.local.md` phase loop). Every test task cites its case IDs in [test-plan.md](test-plan.md). Write tests FIRST (red), then implement (green), per aggregate.

**Organization**: By user story (P1→P4). Greenfield schema reset (no migration). Built on the completed 016 DDD/Fastify/tsyringe/orval foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1–US5 for story phases only
- Paths: server = `apps/server/src`, db = `packages/db/src`, web = `apps/web/src`

## Per-aggregate loop (applies inside every story phase)

Entity → branded id (foundational) → repo interface (`domain/contracts/infrastructure`) → drizzle repo + mapper → manager interface (`domain/contracts/application`) → `Db*Manager` → controller + Zod DTO → DI registration. **L1 tests before entity/service; L2/L3 tests before/with manager+repo.** Named-object params (Constitution VII). `churchId` on every query.

---

## Phase 1: Setup (Shared Test Infrastructure & Tooling)

**Purpose**: Make the safeguard runnable before any code.

- [X] T001 [P] Add scheduling coverage thresholds (domain 100, application 95, repos 90, dtos 100) to `apps/server/vitest.config.ts` per test-plan.md.
- [X] T002 [P] Create dual-church + role seed helpers (`churchA`, `churchB`, user holding admin+leader) in `apps/server/src/test-support/scheduling-fixtures.ts`.
- [X] T003 [P] Add injectable fixed-clock + church-timezone helper for date-only boundary tests in `apps/server/src/test-support/clock.ts`.
- [X] T004 [P] Add spy `INotificationService` + stub `IFeatureFlagService` (deterministic `PARTICIPATION_DEFAULT_ALL_IN`, `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE`) test doubles in `apps/server/src/test-support/`.
- [X] T005 [P] Add Playwright storage states `CHURCH_ADMIN_STORAGE_STATE` / `LEADER_STORAGE_STATE` / `VOLUNTEER_STORAGE_STATE` to `apps/server/src/test-support/e2e-seed.ts` (closes BL-007 for this feature).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story may begin until this phase completes. Greenfield schema + shared primitives.

### Enums & schema (greenfield reset)

- [X] T006 Update `packages/db/src/schema/enums.ts`: change `event_status` → `draft|scheduled|cancelled|past`; add `planning_cycle_state`, `participation_state`, `availability_check_state`, `default_direction`; keep `enforcement_type`. **Retain** all existing `volunteer_notification_type` values (still consumed by 014 dashboard — do not drop; I1/CL-notifications); add cycle-scoped kinds only if new ones are needed.
- [X] T007 [P] New `packages/db/src/schema/planning.ts`: `planning_cycle` (church-scoped, date range, no-overlap exclusion constraint via `btree_gist` per research R2), `event_template`, `time_block`, `ministry_serving_profile`.
- [X] T008 [P] New `packages/db/src/schema/participation.ts`: `ministry_participation`, `participation_slot_inclusion`.
- [X] T009 [P] New `packages/db/src/schema/availability-checks.ts`: `availability_check`.
- [X] T010 Edit `packages/db/src/schema/scheduling.ts`: `event` drop `ministry_id`, add `planning_cycle_id` + `source_template_id`; `time_slot` add `source_template_block_id`; add `shift` table (FK `time_slot_id`+`participation_id`, bounds `CHECK`); re-FK `slot_requirement` → `shift_id` + `participation_id`.
- [X] T011 Edit `packages/db/src/schema/assignments.ts`: re-FK `assignment` → `shift_id` + `participation_id`; reshape `availability` → `availability_check_id` + `shift_id` (unavailability mark).
- [X] T011a [P] Edit `packages/db/src/schema/volunteer-notifications.ts`: add nullable `planning_cycle_id` scope for per-cycle notifications (FR-027 / C2); keep existing `event_id`/`assignment_id`/`ministry_id` columns (additive, non-breaking for 014).
- [X] T012 [P] Edit `packages/db/src/schema/core.ts`: add `ministry.default_direction`.
- [X] T013 Delete `packages/db/src/schema/role-templates.ts`; update `packages/db/src/schema/index.ts` exports.
- [X] T014 Regenerate migration + `bun run db:reset`; update `packages/db/src/seed/factories/scheduling.factory.ts` for cycles/templates/participations demo data.
- [X] T015 [P] DB schema integration tests (constraints, cascades, exclusion) in `packages/db/tests/schema/scheduling.test.ts` per DL3-RC-05.

### Shared domain primitives

- [X] T016 [P] New branded ids in `apps/server/src/domain/branded-ids/`: `planning-cycle-id`, `event-template-id`, `time-block-id`, `ministry-serving-profile-id`, `ministry-participation-id`, `participation-slot-inclusion-id`, `shift-id`, `availability-check-id`; update `index.ts`. Remove `role-template-id`.
- [X] T017 [P] Reshape `Event` entity `apps/server/src/domain/entities/event.ts`: drop `ministryId`, add `planningCycleId`/`sourceTemplateId`, status enum, `markScheduled()`, remove `publish()`.
- [X] T018 [P] Reshape `TimeSlot` entity (add `sourceTemplateBlockId`) + `Ministry` entity (add `defaultDirection`).
- [X] T019 [P] New domain errors in `apps/server/src/domain/errors/`: overlapping-cycle, shift-out-of-bounds, illegal-state-transition, below-full-publish, cross-ministry-scope.
- [X] T020 L1 tests for T017 reshape (DL1-EV-01..05) in `event.test.ts`.

### Legacy removal & RBAC

- [X] T021 Delete RoleTemplate entity/repo/mapper/manager methods/DTO/routes; drop DI registration; add regression test DL2-RB-01 + DL3-HT-11.
- [X] T022 Add `ChurchAdmin` church-level role + RBAC middleware resolver (participation→ministry, shift→participation) in `apps/server/src/api/` + auth; support one user holding admin+leader (FR-030/031). Tests DL3-HT-12/13.

**Checkpoint**: schema live, primitives + RBAC ready — stories can begin.

---

## Phase 3: User Story 1 — ChurchAdmin plans and locks a period (P1) 🎯 MVP

**Goal**: Church-owned calendar: draft cycle → apply templates → generate events/slots → add manual events → lock. Non-overlap + date-only + append-only enforced.

**Independent Test**: Create month cycle, apply Sunday(3)+Wednesday(1) templates + a 3-day dynamic event, verify correct events/slots on exact dates, reject an overlapping cycle, lock → visible to leader, hidden from volunteer.

### Tests (write first, must fail)

- [X] T023 [P] [US1] L1 `PlanningCycle` entity + `DateRange` cycle cases — DL1-PC-01..07, DL1-DR-01..06 — in `planning-cycle.test.ts`, `date-range.test.ts`.
- [X] T024 [P] [US1] L1 `EventTemplate`/`TimeBlock` — DL1-ET-01..05.
- [X] T025 [P] [US1] L2 `PlanningCycleManager` — DL2-PC-01..10 (overlap, isolation, concurrency, lock txn, append-only, reopen, auto-archive).
- [X] T026 [P] [US1] L2 `CycleEventGenerator` — DL2-EG-01..08 (counts, date-only, manual multi-day, rollback).
- [X] T027 [P] [US1] L3 repo contract + HTTP — DL3-RC-01..04 (cycle/template/event repos), DL3-HT-01/02/03.
- [X] T028 [P] [US1] E2E DL4-US1 in `apps/web/tests/scheduling/us1-admin-plan.spec.ts`.

### Implementation

- [X] T029 [P] [US1] `PlanningCycle` entity + repo interface + drizzle repo + mapper.
- [X] T030 [P] [US1] `EventTemplate`+`TimeBlock` entity + repo + mapper.
- [X] T031 [US1] `CycleEventGenerator` domain service (template×dates → events+slots, `sourceTemplateBlockId`) in `apps/server/src/domain/services/cycle-event-generator.ts`.
- [X] T032 [US1] `IPlanningCycleManager` + `DbPlanningCycleManager` (create/list/get/lock/reopen/archive, overlap guard, lock cascades events→scheduled in one txn). **Lazy auto-archive (C1/CL-006)**: on any read/access, a cycle past `endDate` (church tz) resolves to `archived` and rejects mutations — no background scheduler. Covered by test DL2-PC-10 (T025).
- [X] T033 [US1] `IEventTemplateManager` + `DbEventTemplateManager`; extend `IEventManager` with `generateFromTemplates` + manual `createEvent`/`updateEvent`/`cancelEvent` (cycle-scoped).
- [X] T034 [US1] `church-admin-controller.ts` (cycles, templates, apply-templates, manual events, cancel) + Zod DTOs; DI registration.
- [X] T035 [US1] Web: cycle admin + template config + calendar review/lock in `apps/web/src/features/scheduling/`; regenerate orval client.

**Checkpoint**: MVP — admin owns a lockable church calendar.

---

## Phase 4: User Story 2 — Ministry Leader tailors participation & fires availability (P2)

**Goal**: Per-ministry participation seeded from serving profile + default direction; shift splitting; per-shift requirements; fire availability checks.

**Independent Test**: Locked period, ministry with all-out default + profile covering 2 Sunday blocks → 2 pre-included, third off; split one slot into 2 shifts; set headcounts; fire → only intended volunteers get one check.

### Tests (write first, must fail)

- [X] T036 [P] [US2] L1 `Shift`+`ShiftSplitter` — DL1-SH-01..06, DL1-SS-01..07 (bounds, equal-N, manual, remainder decision).
- [X] T037 [P] [US2] L1 `MinistryParticipation` lifecycle + `ProfileSeeder`/three-tier — DL1-MP-01..07, DL1-PS-01..05 (both flag states).
- [X] T038 [P] [US2] L2 `ParticipationManager` — DL2-PT-01..08 (lazy create, inclusions, split, bounds 409, per-shift reqs, cross-ministry isolation, independent splits).
- [X] T039 [P] [US2] L2 `AvailabilityCheckManager` fire/resend — DL2-AF-01..07 (one per membership, notify once, inactive excluded, no dupes).
- [X] T040 [P] [US2] L3 contract + HTTP — DL3-HT-04 (shifts, out-of-bounds/scope), DL3-HT-05 (fire).
- [X] T041 [P] [US2] E2E DL4-US2 in `us2-leader-tailor.spec.ts`.

### Implementation

- [X] T042 [P] [US2] `Shift` entity (bounds invariant) + `ShiftSplitter` service + repo/mapper.
- [X] T043 [P] [US2] `MinistryParticipation` + `ParticipationSlotInclusion` entities + repos/mappers.
- [X] T044 [P] [US2] `MinistryServingProfile` entity + repo/mapper; reshape `SlotRequirement` → shift+participation.
- [X] T045 [US2] `ProfileSeeder` domain service (three-tier default direction; dynamic events never seeded); wire into `CycleEventGenerator` (T031).
- [X] T046 [US2] `IParticipationManager` + `DbParticipationManager` (get/lazy-create, setInclusions, splitShifts, upsertRequirement, servingProfile, defaultDirection).
- [X] T047 [US2] `IAvailabilityCheckManager` + `DbAvailabilityCheckManager` (fire spawns checks per membership + notify; resend); participation `tailoring→availability_fired`. Notifications write with `planning_cycle_id` scope (T011a) — reminder kind is leader-resendable (FR-027).
- [X] T048 [US2] Extend `admin-leader-controller.ts` (leader participation/shift/requirement/fire) + serving-profile + default-direction admin routes; DTOs; DI.
- [X] T049 [US2] Web: participation tailoring, shift-split form (bounds guard), headcount matrix, fire button; orval regen.

**Checkpoint**: leaders tailor + fire; US1+US2 independently testable.

---

## Phase 5: User Story 3 — Volunteer declares availability & confirms (P2)

**Goal**: Available-by-default; mark unavailable per shift/whole-day; mandatory confirm gate; cross-ministry overlap policy per flag.

**Independent Test**: Volunteer in two ministries marks one shift unavailable, confirms with an overlap across ministries → behaviour per flag; leader sees acknowledged vs not-looked.

### Tests (write first, must fail)

- [X] T050 [P] [US3] L1 `AvailabilityCheck` + `Availability` mark + `AvailabilityOverlap` — DL1-AC-01..04, DL1-AV-01..04, DL1-OV-01..04.
- [X] T051 [P] [US3] L2 volunteer availability — DL2-VA-01..07 (marks-only, whole-day, confirm zero-marks, permission, both flag states, conflict flagged).
- [X] T052 [P] [US3] L3 HTTP — DL3-HT-08 (marks own/other), DL3-HT-09 (confirm + overlap flag).
- [X] T053 [P] [US3] E2E DL4-US3 (both flag states) in `us3-volunteer-availability.spec.ts`.

### Implementation

- [X] T054 [P] [US3] `AvailabilityCheck` entity (confirm gate) + `Availability` reshape (mark) + repos/mappers.
- [X] T055 [P] [US3] `AvailabilityOverlap` domain service (same-date cross-ministry shift intersection).
- [X] T056 [US3] Extend `IVolunteerManager`/`DbVolunteerManager`: listChecks, getCheck, setUnavailability, confirm (overlap policy via flag, flag conflict to leaders).
- [X] T057 [US3] Extend `volunteer-controller.ts` (checks/marks/confirm) + DTOs; remove old free-span `PUT /volunteer/availability`; DI.
- [X] T058 [US3] Web: availability-check list, per-shift/whole-day marking, confirm; overlap warning; orval regen.

**Checkpoint**: availability pipeline complete end to end.

---

## Phase 6: User Story 4 — Ministry Leader rosters and publishes (P3)

**Goal**: Ranked eligible list; assign with completion%; assignment-overlap enforcement (soft/hard + audited override); per-participation publish (below-100% with confirm), isolating other ministries.

**Independent Test**: Assign volunteers, watch completion% rise, leave one slot unfilled, publish with confirmation → only this ministry's volunteers see assignments; other ministry on same event unaffected.

### Tests (write first, must fail)

- [X] T059 [P] [US4] L1 assignment conflict + completion — DL1-OV-05, DL1-MP-05/06. (Covered by pre-existing `conflict-validation-service.test.ts` soft/hard/override cases plus `ministry-participation.test.ts` DL1-MP-05/06.)
- [X] T060 [P] [US4] L2 rostering — DL2-RS-01..09 (ranking, tie-break, completion, no double-book, soft/hard override+audit, permission, isolation).
- [X] T061 [P] [US4] L2 publish — DL2-PB-01..05 (below-full, sibling isolation, scoped reveal).
- [X] T062 [P] [US4] L3 HTTP — DL3-HT-06 (assign/override), DL3-HT-07 (publish/below-full). (`tests/http/leader-rostering.http.test.ts`, `tests/http/volunteer-schedule.http.test.ts`.)
- [X] T063 [P] [US4] E2E DL4-US4 in `us4-roster-publish.spec.ts`.

### Implementation

- [X] T064 [P] [US4] Reshape `Assignment` entity → shift+participation (native team attribution, closes BL-006) + repo/mapper.
- [X] T065 [US4] Extend `IAssignmentManager`/`DbAssignmentManager`: eligible ranking (availability then least-recent), createAssignment with soft/hard conflict + audited override, deleteAssignment reopens slot.
- [X] T066 [US4] Extend `IParticipationManager`: completion%, publish (`rostering→published`, below-full confirm, sibling isolation, scoped reveal).
- [X] T067 [US4] Leader rostering routes (eligible, assignments, completion, publish) + DTOs; DI. (Landed in a dedicated `leader-rostering-controller.ts` rather than extending `admin-leader-controller.ts`.)
- [X] T066a [US4] Extend `IVolunteerManager`/`DbVolunteerManager` with `getPublishedSchedule` (volunteer sees only published-participation slices — FR-025 / C3) + `volunteer-schedule-controller.ts` `GET /volunteer/schedule`; DTO; DI.
- [X] T067a [US4] Reshape the 014 volunteer-dashboard read paths to the new model (I2): update `apps/web/src/features/volunteers/lib/dashboard-mappers.ts`, `ministry-schedule-section.tsx`, and `use-volunteer-dashboard.ts` to match assignments by `shiftId` + `participationId`; **remove the `claimedAssignmentIds` workaround** (closes BL-006). Update affected component/query tests.
- [X] T068 [US4] Web: roster builder (ranked pool, completion meter, conflict badges, publish confirm) in `apps/web/src/routes/scheduling/rostering/`; orval regen.

**Checkpoint**: full schedule produced + published per ministry.

---

## Phase 7: User Story 5 — Live execution & late changes (P4)

**Goal**: Volunteer cancels own published assignment (leader notified, slot reopens); leader reassigns mid-cycle.

**Independent Test**: Volunteer cancels own assignment → leader notified + slot reopens; cannot cancel others'; leader reassigns.

### Tests (write first, must fail)

- [ ] T069 [P] [US5] L2 live changes — DL2-LC-01..03 (cancel-own reopen+notify, permission 403, triage).
- [ ] T070 [P] [US5] L3 HTTP — DL3-HT-10 (cancel own/other).
- [ ] T071 [P] [US5] E2E DL4-US5 in `us5-live-changes.spec.ts`.

### Implementation

- [ ] T072 [US5] Extend `IVolunteerManager`: cancelOwnAssignment (own-only, notify leader, reopen slot).
- [ ] T073 [US5] Extend `IAssignmentManager`: reassign mid-cycle + notify affected volunteers; per-cycle notification kinds.
- [ ] T074 [US5] Controller routes (`POST /volunteer/assignments/:id/cancel`, `PATCH /leader/assignments/:id/reassign`) + DTOs; DI.
- [ ] T075 [US5] Web: cancel-own control (own shifts only) + leader reassign; notifications view; orval regen.

**Checkpoint**: all five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T076 [P] E2E cross-cutting DL4-X1/X2/X3 (church isolation, network-failure no-partial-state, double-submit) in `apps/web/tests/scheduling/cross-cutting.spec.ts`.
- [ ] T077 [P] Run quickstart.md end-to-end; confirm SC-001..008 timings/behaviour.
- [ ] T078 [P] Update planning docs superseding notes if drifted; verify traceability matrix (test-plan.md) all-green.
- [ ] T079 Coverage gate: fill uncovered branches to meet thresholds (T001); no aggregate ships red.
- [ ] T080 Full safeguard sweep: `bun run check` · `check-types` · `test` · `test:e2e` + `/review` on changed files (agents.local.md phase loop).

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: immediate.
- **Phase 2 (Foundational)**: after Setup — **blocks all stories**. T006→T014 sequential (schema chain); T007/T008/T009/T012 [P]; T016/T017/T018/T019 [P] after ids.
- **US1 (P1)**: after Phase 2. MVP.
- **US2 (P2)**: after Phase 2; T045 wires into T031 (US1 generator) — US2 depends on US1 generator existing.
- **US3 (P2)**: after Phase 2; needs `Shift` (US2 T042) for marks → depends on US2.
- **US4 (P3)**: after Phase 2; needs shifts/requirements (US2) + availability (US3) for ranking.
- **US5 (P4)**: after US4 (needs published assignments).
- **Phase 8**: after desired stories complete.

Real chain: US1 → US2 → US3 → US4 → US5 (each an increment). Within a story, [P] tasks parallelize; tests before implementation.

## Parallel example (US1)

```bash
# Tests first, together:
Task: "L1 PlanningCycle+DateRange — planning-cycle.test.ts, date-range.test.ts"
Task: "L1 EventTemplate/TimeBlock — event-template.test.ts"
Task: "L2 PlanningCycleManager — db-planning-cycle-manager.test.ts"
Task: "L2 CycleEventGenerator — cycle-event-generator.test.ts"
# Then entities in parallel:
Task: "PlanningCycle entity + repo + mapper"
Task: "EventTemplate + TimeBlock entity + repo + mapper"
```

## Implementation Strategy

1. Setup + Foundational → foundation ready (schema live, primitives, RBAC).
2. US1 → validate independently → MVP (admin lockable calendar).
3. US2 → US3 → US4 → US5, each test-first, each an independently demoable increment.
4. Per `agents.local.md`: complete each phase's tests + `check`/`check-types`/`test`/`test:e2e` + code review before advancing; patch findings same iteration.

## Notes

- Greenfield: schema reset in Foundational, no data migration (Assumption).
- Every L2/L3 suite seeds churchA+churchB and asserts isolation.
- Flag-dependent cases (`PARTICIPATION_DEFAULT_ALL_IN`, `ALLOW_OVERLAP_SAVE`) run both states.
- Named-object params on all manager/domain methods (Constitution VII).
- Open decisions to lock during impl (from test-plan): equal-split remainder rule, overlapping manual spans, re-apply-templates dedupe, completion% at 0 required.
