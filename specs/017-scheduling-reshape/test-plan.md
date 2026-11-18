# Test Plan: Scheduling Reshape (017)

Tests are a primary safeguard. Every functional requirement (FR-001…031), success criterion (SC-001…008), domain invariant, and state transition in this feature MUST be covered by at least one test, at the lowest pyramid layer that can prove it. This document is the authoritative test-case catalogue; `/speckit-tasks` derives test tasks from it and `/test.generate` implements the code once the aggregates exist.

## Stack mapping

| Pyramid layer | Tooling | Where |
|---|---|---|
| **L1 — Domain unit** (entities, value objects, domain services) | Vitest, pure, no DB, no framework | `apps/server/src/**/*.test.ts` co-located |
| **L2 — Integration** (managers + drizzle repos + real Postgres) | Vitest + `packages/db` test harness | `apps/server/src/application/**`, `infrastructure/repositories/**` |
| **L3 — Contract** (repo-interface conformance + HTTP endpoint contract) | Vitest — repo contract tests in `domain/contracts/contract-tests`; HTTP tests via Fastify `inject` | per repo + per controller |
| **L4 — E2E** (full user journeys) | Playwright | `apps/web/tests/scheduling/` |

**Rule**: prove an invariant once, as low as possible. Domain invariants → L1. Church isolation + DB constraints + transactions → L2. Interface conformance + wire shape/status codes + RBAC → L3. User-visible journeys + policy-flag behaviour → L4.

## Scenario classes (applied to every suite)

1. Happy path · 2. Edge/boundary · 3. Invalid input · 4. Permission/authorization · 5. System/infra failure · 6. Concurrency/race · 7. State-transition failure · 8. Catastrophic. Not every class applies to every unit; where a class is N/A, state why in the suite header.

## Fixtures & mocking strategy

- **DB harness**: `packages/db` `setup-test-db` — real Postgres per integration/contract suite, truncated between tests. Never mock Drizzle at L2/L3.
- **Church isolation fixture**: seed **two** churches (`churchA`, `churchB`) in every L2/L3 suite so cross-tenant leakage is provable, not assumed.
- **Unleash flags**: inject a stub `IFeatureFlagService` at L1/L2 (deterministic `PARTICIPATION_DEFAULT_ALL_IN`, `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE`). Each flag-dependent case runs **both** states.
- **Clock**: inject a fixed clock / church timezone into date-only boundary logic — no `new Date()` reliance in assertions. Freeze around midnight + month boundaries.
- **Auth storage states (E2E)**: `CHURCH_ADMIN_STORAGE_STATE`, `LEADER_STORAGE_STATE`, `VOLUNTEER_STORAGE_STATE` (closes BL-007 gap for this feature). Seed a user holding both admin+leader to prove role coexistence.
- **Notifications**: assert against a spy `INotificationService` at L2; assert delivery/visibility at L4.

---

## L1 — Domain unit tests

### DL1-DR · DateRange VO (reused for cycles)

- DL1-DR-01 (happy) `create(start,end)` with `start<end` returns range.
- DL1-DR-02 (invalid) `end <= start` throws `InvalidDateRangeError`.
- DL1-DR-03 (edge) `end === start` throws (zero-width rejected).
- DL1-DR-04 (happy) `contains(date)` true on inclusive bounds, false outside.
- DL1-DR-05 (happy) `overlaps` true for partial overlap, touching-edge case (`a.end === b.start`) returns **false** (gaps/adjacency allowed — FR-002).
- DL1-DR-06 (edge) date-only truncation: a `23:59` and `00:01` next-day compare by date, church tz (FR-003).

### DL1-PC · PlanningCycle entity (FR-001…006, SC-005)

- DL1-PC-01 (happy) construct draft cycle; state defaults `draft`.
- DL1-PC-02 (invalid) `startDate >= endDate` throws.
- DL1-PC-03 (happy) `lock()` `draft → locked`.
- DL1-PC-04 (state-fail) `lock()` on `locked` or `archived` throws (idempotency/illegal transition).
- DL1-PC-05 (happy) `archive()` `locked → archived`; and `draft → archived` on expiry rule.
- DL1-PC-06 (state-fail) `reopenEvent` only permitted while `locked` (not archived).
- DL1-PC-07 (edge) boundary evaluation date-only (defer overlap to L2 where multiple cycles exist).

### DL1-ET · EventTemplate + TimeBlock (FR-007)

- DL1-ET-01 (happy) template with ordered blocks, one weekday.
- DL1-ET-02 (invalid) block `startTime >= endTime` throws.
- DL1-ET-03 (edge) single block; blocks preserve order.
- DL1-ET-04 (invalid) weekday outside 0..6 throws.
- DL1-ET-05 (happy) each block carries stable id (used as `sourceTemplateBlockId`).

### DL1-SH · Shift entity + bounds invariant (FR-014, ADR 0002)

- DL1-SH-01 (happy) shift within slot bounds constructs.
- DL1-SH-02 (edge) shift equal to whole slot (default, no split) valid.
- DL1-SH-03 (invalid) `shift.start < slot.start` throws bounds error.
- DL1-SH-04 (invalid) `shift.end > slot.end` throws.
- DL1-SH-05 (invalid) `shift.start >= shift.end` throws.
- DL1-SH-06 (edge) shift touching slot start/end exactly is allowed (inclusive bounds).

### DL1-SS · ShiftSplitter domain service (FR-014)

- DL1-SS-01 (happy) equal-N split: N shifts of equal span covering slot exactly.
- DL1-SS-02 (edge) N=1 → single shift = whole slot.
- DL1-SS-03 (edge) span not divisible by N → **final shift absorbs remainder** (CL-014); assert shifts tile slot exactly, no gaps/overlaps.
- DL1-SS-04 (invalid) N=0 or negative throws.
- DL1-SS-05 (happy) manual spans (unequal) all within bounds → shifts.
- DL1-SS-06 (invalid) any manual span out of bounds → throws, no partial creation.
- DL1-SS-07 (edge) manual spans may be non-contiguous (gaps allowed); overlapping manual spans → **rejected** (CL-014).

### DL1-MP · MinistryParticipation entity + lifecycle (FR-011, FR-024)

- DL1-MP-01 (happy) state defaults `tailoring`.
- DL1-MP-02 (happy) transitions `tailoring→availability_fired→rostering→published` in order.
- DL1-MP-03 (state-fail) skip transition (e.g. `tailoring→published`) throws.
- DL1-MP-04 (state-fail) re-fire from `published` throws.
- DL1-MP-05 (happy) completion% = assigned/required; **0 required → 100%** (CL-022) (FR-022).
- DL1-MP-06 (edge) publish below 100% requires explicit confirm flag; without it throws (FR-024).
- DL1-MP-07 (happy) publish sets state `published`; does not mutate sibling participations (unit proves own-state only; isolation proven L2/L4).

### DL1-AC · AvailabilityCheck entity (FR-018, FR-019)

- DL1-AC-01 (happy) state defaults `pending`.
- DL1-AC-02 (happy) `confirm()` `pending → confirmed`, sets `confirmedAt`, even with zero marks.
- DL1-AC-03 (state-fail) `confirm()` twice → second throws or no-op (assert chosen).
- DL1-AC-04 (happy) volunteer available-by-default: absence of marks ⇒ available for all shifts.

### DL1-AV · Availability (unavailability mark) (FR-018)

- DL1-AV-01 (happy) mark keyed to `shiftId` + `checkId`; existence ⇒ unavailable.
- DL1-AV-02 (edge) whole-day helper expands to one mark per shift on that date.
- DL1-AV-03 (edge) removing mark restores default-available.
- DL1-AV-04 (invalid) mark for a shift not in the check's cycle/membership rejected.

### DL1-EV · Event entity reshape (FR-009, FR-010, FR-026)

- DL1-EV-01 (happy) construct with `planningCycleId`, no `ministryId` field exists.
- DL1-EV-02 (happy) status enum `draft|scheduled|cancelled|past`; **no** `published` (assert type/enum).
- DL1-EV-03 (happy) `markScheduled()` `draft→scheduled` (cycle-lock driven).
- DL1-EV-04 (happy) `cancel()`, `markAsPast()` transitions.
- DL1-EV-05 (regression) `publish()` method removed (compile-time + no runtime path).

### DL1-OV · AvailabilityOverlap + assignment conflict service (FR-020, FR-023)

- DL1-OV-01 (happy) two shifts same date, times intersect → overlap detected.
- DL1-OV-02 (edge) adjacent shifts (touching edges) → **no** overlap.
- DL1-OV-03 (edge) overlap by absolute **timestamp** intersection, not date-only (CL-020); a shift crossing midnight is compared correctly; same clock-time different dates → no overlap.
- DL1-OV-04 (happy) cross-ministry only: overlap within same ministry not flagged by the availability-confirm control.
- DL1-OV-05 (happy) assignment conflict soft → warn payload; hard → block signal + override consumes reason.

### DL1-PS · ProfileSeeder + three-tier default direction (FR-012, FR-013)

- DL1-PS-01 (happy) profile entry `serves=true` seeds inclusion + shifts + requirements for matching `sourceTemplateBlockId`.
- DL1-PS-02 (happy) no profile → falls to ministry `defaultDirection`; `all_in` seeds all slots, `all_out` seeds none.
- DL1-PS-03 (happy) global flag tier: no ministry setting → global `PARTICIPATION_DEFAULT_ALL_IN` decides (both flag states tested).
- DL1-PS-04 (edge) narrower tier wins: manual choice overrides ministry, ministry overrides global.
- DL1-PS-05 (edge) dynamic event (no template) never auto-seeded (spec edge case).

---

## L2 — Integration tests (managers + repos + real DB)

Every L2 suite seeds `churchA` + `churchB`; every read/write asserts **church isolation** (Quality Gate 2).

### DL2-PC · PlanningCycleManager

- DL2-PC-01 (happy) createCycle persists; getCycle returns it.
- DL2-PC-02 (invalid) overlapping range same church → `409`/domain error, nothing persisted (FR-002).
- DL2-PC-03 (edge) adjacent ranges (gap/touching) same church allowed (FR-002).
- DL2-PC-04 (isolation) churchB may create a range overlapping churchA's — allowed (per-church scope).
- DL2-PC-05 (concurrency) two concurrent createCycle with overlapping ranges → exactly one succeeds (DB exclusion constraint / serialized txn — R2).
- DL2-PC-06 (happy) listCycles filters by state; draft not returned to a leader-scoped query (FR-004).
- DL2-PC-07 (state) lockCycle flips events `draft→scheduled` in same transaction; partial failure rolls all back.
- DL2-PC-08 (happy) append-only: add event to locked cycle succeeds; edit locked event without reopen → rejected (FR-005).
- DL2-PC-09 (edge) reopenEvent re-notifies fired participations (spy notification) (edge case).
- DL2-PC-10 (edge) auto-archive: cycle past endDate (church tz) becomes archived/read-only (FR-006) — clock injected.

### DL2-EG · CycleEventGenerator / IEventManager.generateFromTemplates

- DL2-EG-01 (happy) apply Sunday(3 blocks)+Wednesday(1) over a month → one Event per matching weekday date, one TimeSlot per block, each slot records `sourceTemplateBlockId` (FR-008). Assert exact date set + count.
- DL2-EG-02 (edge) month with 5 Sundays vs 4 — count matches actual matching dates.
- DL2-EG-03 (edge) template weekday with zero matching dates in range → zero events, no error.
- DL2-EG-04 (happy) generation seeds each ministry's participation via serving profile in one transaction (FR-013).
- DL2-EG-05 (system) mid-generation DB failure rolls back entirely — no orphan events/slots.
- DL2-EG-06 (idempotency) applying same templates twice → **dedupe** by (date, `sourceTemplateBlockId`); no duplicate slots, leader tailoring preserved (CL-008).
- DL2-EG-07 (happy) manual multi-day event: start inside cycle, end after → linked to this cycle by start date, extends beyond (FR-009, edge case).
- DL2-EG-08 (edge) event starting 23:00 last day of cycle belongs to cycle (date-only, church tz).

### DL2-PT · ParticipationManager (tailoring/shifts/requirements)

- DL2-PT-01 (happy) getParticipation lazily creates; returns seeded inclusions/shifts/requirements.
- DL2-PT-02 (happy) setInclusions opts slots in/out; absence ⇒ not serving (FR-012).
- DL2-PT-03 (happy) splitShifts equal-N persists N shifts within bounds.
- DL2-PT-04 (invalid) manual shift out of slot bounds → `409`, DB `CHECK` also rejects (belt-and-suspenders).
- DL2-PT-05 (happy) upsertRequirement per shift/role/team; requiredCount>=1 enforced by DB.
- DL2-PT-06 (isolation) leader of ministryX cannot read/write ministryY participation (FR-031) — enforced at manager scope.
- DL2-PT-07 (happy) two ministries split the SAME TimeSlot differently — both persist independently (ADR 0002).
- DL2-PT-08 (state) mutating shifts after `availability_fired` — assert allowed-with-renotify or blocked per spec.

### DL2-AF · AvailabilityCheckManager (fire/confirm/resend)

- DL2-AF-01 (happy) fireAvailability creates exactly one check per active `(cycle, membership)`; volunteer in 2 ministries → 2 checks (FR-017).
- DL2-AF-02 (happy) only that ministry's active members get checks + one notification each (FR-017) — spy.
- DL2-AF-03 (edge) inactive/on_hold memberships excluded.
- DL2-AF-04 (idempotency) re-fire does not duplicate existing pending checks.
- DL2-AF-05 (happy) participation `tailoring→availability_fired` in same txn as check creation.
- DL2-AF-06 (happy) resendReminder re-notifies without creating new checks (FR-027).
- DL2-AF-07 (isolation) checks scoped to church.
- DL2-AF-08 (happy) fired/resent notifications persist with `planning_cycle_id` scope; existing 014 kinds untouched (C2/I1).

### DL2-VA · VolunteerManager availability (marks/confirm/overlap)

- DL2-VA-01 (happy) setUnavailability writes only marked shifts; unmarked remain available (FR-018).
- DL2-VA-02 (edge) whole-day marks every shift on the date.
- DL2-VA-03 (happy) confirm with zero marks → `confirmed` + `confirmedAt` (FR-019).
- DL2-VA-04 (permission) volunteer cannot mark/confirm another volunteer's check.
- DL2-VA-05 (flag OFF) overlap across ministries same date + `ALLOW_OVERLAP_SAVE=false` → confirm blocked (FR-020).
- DL2-VA-06 (flag ON) same overlap + flag true → confirm succeeds, conflict flagged to affected leaders (FR-020, SC-007) — assert flag record + spy.
- DL2-VA-07 (edge) non-overlapping availability across ministries confirms cleanly.

### DL2-RS · Rostering / AssignmentManager (FR-021…023, FR-029)

- DL2-RS-01 (happy) listEligibleVolunteers ranked: available first, then least-recent serving (FR-021) — assert order with seeded serving history + availability.
- DL2-RS-02 (edge) tie-break determinism (stable order).
- DL2-RS-03 (happy) createAssignment raises completion% correctly (FR-022).
- DL2-RS-04 (invalid) second assignment same volunteer+shift rejected (one per volunteer per shift).
- DL2-RS-05 (conflict soft) overlapping assignment, ministry `enforcementType=soft` → created + warning surfaced.
- DL2-RS-06 (conflict hard) `enforcementType=hard` → blocked; override with reason creates + writes audit row (FR-023) — assert audit trail.
- DL2-RS-07 (permission) override requires authorization; missing reason rejected.
- DL2-RS-08 (happy) reassign mid-cycle updates roster + notifies affected volunteers (FR-029).
- DL2-RS-09 (isolation) assignment scoped to participation/church.

### DL2-PB · Publish per participation (FR-024, FR-025)

- DL2-PB-01 (happy) publish full roster `rostering→published`.
- DL2-PB-02 (edge) publish below 100% with `confirmBelowFull` succeeds; unfilled slots remain open (FR-024).
- DL2-PB-03 (invalid) publish below 100% without confirm → rejected.
- DL2-PB-04 (isolation) publishing ministryX participation on a shared event does NOT change ministryY's participation state (FR-025) — two participations on one event asserted.
- DL2-PB-05 (happy) publish reveals slice only to this ministry's volunteers (data-scope assertion; visual at L4).
- DL2-PB-06 (happy) `getPublishedSchedule` returns only assignments from `published` participations for the volunteer; unpublished/other-ministry slices excluded (C3, FR-025).
- DL2-DS-01 (regression, I2) 014 ministry-schedule read matches assignments by `shiftId`+`participationId`; same role in one slot under two teams attributes to correct team row; `claimedAssignmentIds` workaround removed (closes BL-006).

### DL2-LC · Live changes / cancellation (FR-028)

- DL2-LC-01 (happy) volunteer cancels own assignment → slot reopens (requirement unmet again) + leader notified (spy).
- DL2-LC-02 (permission) volunteer cancelling another's assignment → `403`, nothing changes (SC-004).
- DL2-LC-03 (edge) cancelled slot enters same triage/open state as unfilled (FR-028).

### DL2-RB · RoleTemplate removal (R9)

- DL2-RB-01 (regression) no `role_template` table/repo/manager path resolvable; DI does not register it.

---

## L3 — Contract tests

### Repo interface conformance (`domain/contracts/contract-tests`)

For **each** new repo (`IPlanningCycleRepository`, `IEventTemplateRepository`, `IMinistryServingProfileRepository`, `IMinistryParticipationRepository`, `IShiftRepository`, `IAvailabilityCheckRepository`) and each reshaped repo (event, availability, slot-requirement, assignment):

- DL3-RC-01 CRUD round-trip returns domain entity equal to input (mapper symmetry).
- DL3-RC-02 church-scoped finder never returns other church rows.
- DL3-RC-03 cascade deletes behave per FK (`onDelete`) — deleting event removes its slots/shifts/inclusions.
- DL3-RC-04 nullable columns (`sourceTemplateBlockId`, `teamId`, `confirmedAt`) map to `undefined` correctly.
- DL3-RC-05 range `CHECK` constraints reject bad rows at DB level (shift bounds, requiredCount, cycle dates).

### HTTP contract (Fastify `inject`, per endpoint in contracts/http-api.md)

Per endpoint assert: success status + body shape (Zod DTO), `422` on bad body, `403` on wrong role/scope, church isolation. Key endpoints:

- DL3-HT-01 `POST /admin/planning-cycles` → 201; overlapping → 409; leader token → 403.
- DL3-HT-02 `POST …/lock` → 204; volunteer/leader token → 403; already locked → 409.
- DL3-HT-03 `POST …/apply-templates` → 201 with generated counts; bad templateIds → 422.
- DL3-HT-04 `POST /leader/participations/:id/slots/:slotId/shifts` → 201; out-of-bounds → 409; other ministry's participation → 403 (FR-031).
- DL3-HT-05 `POST …/fire-availability` → 202; wrong state → 409.
- DL3-HT-06 `POST /leader/shifts/:id/assignments` → 201; hard conflict no override → 409; override → 201 + audit.
- DL3-HT-07 `POST /leader/participations/:id/publish` → 204; below-full no confirm → 409.
- DL3-HT-08 `PUT /volunteer/availability-checks/:id/marks` → 200 own; other's → 403.
- DL3-HT-09 `POST …/confirm` → 204; overlap flag OFF → 409, flag ON → 204+flagged.
- DL3-HT-10 `POST /volunteer/assignments/:id/cancel` own → 204; other's → 403 (SC-004).
- DL3-HT-11 (regression) removed routes return 404: `/admin/role-templates/*`, `POST /admin/events/:id/publish`, old `PUT /volunteer/availability`.
- DL3-HT-12 (auth) unauthenticated → 401 on every protected route.
- DL3-HT-13 (role coexistence) a user with both admin+leader roles reaches both surfaces (FR-030).

---

## L4 — E2E (Playwright) — five user stories

Each maps to spec "Independent Test". Seed via `apps/server` test-support; use per-role storage states.

- DL4-US1 (P1) admin: create month cycle → apply Sunday(3)+Wednesday(1) → verify events/slots on exact dates → add 3-day dynamic event → attempt overlapping cycle (blocked) → lock → assert visible to leader, hidden from volunteer. (SC-001 timing sanity, SC-005.)
- DL4-US2 (P2) leader: open participation (2 of 3 Sunday blocks pre-included, all-out third off) → split one slot into 2 shifts → set headcounts → fire availability → only intended volunteers receive one request. (SC-002.)
- DL4-US3 (P2) volunteer in two ministries: open both checks, available-by-default → mark one shift unavailable → confirm with overlap across ministries → assert policy per flag (both flag states run) → leader sees "acknowledged" vs "not looked". (SC-003, SC-007.)
- DL4-US4 (P3) leader: eligible list ranked by availability + least-recent → assign, watch completion% rise → leave one slot unfilled → publish with confirmation → only this ministry's volunteers see assignments; second ministry on same event unaffected. (SC-004, SC-006.)
- DL4-US5 (P4) volunteer: cancel own published assignment → leader notified + slot reopens → volunteer cannot cancel another's (control hidden/blocked) → leader reassigns mid-cycle. (SC-004, SC-008.)
- DL4-X1 (cross) church isolation: churchA admin never sees churchB cycles/events in any view.
- DL4-X2 (system) network failure on lock/publish shows error, no partial state.
- DL4-X3 (concurrency) double-click publish/confirm creates no duplicate side effect.

---

## Traceability matrix

### FR → tests

| FR | Covered by |
|---|---|
| FR-001 create cycle | DL1-PC-01, DL2-PC-01, DL3-HT-01, DL4-US1 |
| FR-002 no overlap, gaps ok | DL1-DR-05, DL2-PC-02/03/04/05, DL3-HT-01, DL4-US1 |
| FR-003 date-only boundaries | DL1-DR-06, DL2-EG-08, DL2-PC-10 |
| FR-004 draft admin-only | DL2-PC-06, DL3-HT-01, DL4-US1 |
| FR-005 lock append-only/reopen | DL1-PC-03/06, DL2-PC-07/08/09, DL3-HT-02 |
| FR-006 auto-archive (lazy) | DL1-PC-05, DL2-PC-10 (T032 read-path) |
| FR-007 templates+blocks | DL1-ET-01..05 |
| FR-008 apply → events/slots | DL2-EG-01/02/03, DL3-HT-03, DL4-US1 |
| FR-009 manual/multi-day | DL2-EG-07, DL4-US1 |
| FR-010 church-owned event | DL1-EV-01, DL2-PB-04 |
| FR-011 participation aggregate | DL1-MP-01, DL2-PT-01 |
| FR-012 inclusions | DL1-PS-01, DL2-PT-02, DL4-US2 |
| FR-013 three-tier default | DL1-PS-02/03/04, DL2-EG-04 |
| FR-014 shift split+bounds | DL1-SH-01..06, DL1-SS-01..07, DL2-PT-03/04/07, DL3-HT-04 |
| FR-015 attach to shift | DL1-AV-01, DL2-RS-*, DL2-PT-05 |
| FR-016 headcount per shift | DL2-PT-05, DL4-US2 |
| FR-017 one check per membership | DL2-AF-01/02/03, DL4-US2 |
| FR-018 available-by-default marks | DL1-AC-04, DL1-AV-*, DL2-VA-01/02 |
| FR-019 confirm gate | DL1-AC-02, DL2-VA-03, DL3-HT-09, DL4-US3 |
| FR-020 availability overlap policy | DL1-OV-01..04, DL2-VA-05/06, DL3-HT-09, DL4-US3 |
| FR-021 eligible ranking | DL2-RS-01/02, DL4-US4 |
| FR-022 completion% | DL1-MP-05, DL2-RS-03, DL4-US4 |
| FR-023 assignment conflict + override | DL1-OV-05, DL2-RS-05/06/07, DL3-HT-06 |
| FR-024 publish below 100% | DL1-MP-06, DL2-PB-02/03, DL3-HT-07, DL4-US4 |
| FR-025 per-participation isolation | DL2-PB-04/05, DL4-US4 |
| FR-026 event never published | DL1-EV-02/05, DL3-HT-11 |
| FR-027 per-cycle notifications + resend | DL2-AF-02/06/08, DL2-PC-09 (schema T011a) |
| FR-028 cancel own + reopen | DL2-LC-01/02/03, DL3-HT-10, DL4-US5 |
| FR-029 reassign mid-cycle | DL2-RS-08, DL4-US5 |
| FR-030 ChurchAdmin role | DL3-HT-13, DL4-US1 |
| FR-031 leader scoped post-lock | DL2-PT-06, DL3-HT-04 |

### SC → E2E/proof

| SC | Proof |
|---|---|
| SC-001 plan+lock < 10min | DL4-US1 (+ manual timing) |
| SC-002 → fired < 5min | DL4-US2 |
| SC-003 acknowledge < 30s | DL4-US3 |
| SC-004 own-only cancel | DL2-LC-02, DL3-HT-10, DL4-US5 |
| SC-005 no overlap, 1 cycle/event | DL2-PC-02/05, DL2-EG-08 |
| SC-006 staffing → 1 participation | DL2-PB-04, DL4-US4 |
| SC-007 overlaps surfaced 100% | DL2-VA-06, DL4-US3 |
| SC-008 cancel notify+reopen secs | DL2-LC-01, DL4-US5 |

## Coverage thresholds (vitest.config)

| Path | stmts/branches/funcs/lines |
|---|---|
| `apps/server/src/domain/**` (entities, VOs, services) | 100 / 100 / 100 / 100 |
| `apps/server/src/application/**` (managers) | 95 / 90 / 95 / 95 |
| `apps/server/src/infrastructure/repositories/**` | 90 / 85 / 90 / 90 |
| `apps/server/src/api/dtos/**` (Zod) | 100 / 100 / 100 / 100 |

Uncovered **branches** are the action list — every domain invariant and every flag/enforcement fork must show both sides green. No aggregate ships until its L1+L2 suites pass and its FRs above are green.

## Resolved decisions (post /speckit-analyze, 2026-07-03)

Previously-open items now pinned in spec Clarifications — tests assert these contracts, not guesses:

- CL-014 equal-split remainder → final shift absorbs (DL1-SS-03); overlapping manual spans rejected (DL1-SS-07).
- CL-008 template re-apply → idempotent dedupe by (date, block) (DL2-EG-06).
- CL-022 zero-required completion → 100% (DL1-MP-05).
- CL-020 overlap → absolute timestamp intersection, midnight-safe (DL1-OV-03).
- CL-006 auto-archive → lazy on read, no scheduler (DL2-PC-10).
- CL-PROFILE serving-profile authoring → church-admin surface (DL3-HT-04 scope / admin routes).

## Definition of done (per aggregate/batch, per agents.local.md)

1. L1 behaviour tests written first (red) → implement → green.
2. L2 integration + L3 contract green against real DB.
3. `bun run check` · `bun run check-types` · `bun run test` · `bun run test:e2e` all pass.
4. Code review on modified files; findings patched same iteration.
5. Traceability rows for the batch's FRs flipped to green.
