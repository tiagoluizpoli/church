# Coverage Plan: Event Builder (Cycle-Centric)

**Feature**: `023-event-builder` | **Date**: 2026-07-14 | **Authority**: test-master (`/test.master` step 1 — Plan)

Maps the 8 scenario classes across the testing pyramid onto this feature's surfaces. Adapted to the repo stack — **Vitest** (unit/schema/integration), **React Testing Library + user-event** (component), **Playwright** (E2E), **Drizzle + Dockerized PostgreSQL** (repo integration). There is **no Appwrite**; the authorization axis (Class 4) is **RBAC (`canManageMinistry`) + multi-tenant `churchId` isolation** (R2/R8). Consume this plan with `/test.generate` during `/speckit-implement`; each scenario is a checkbox so progress is trackable.

Scenario classes: **C1** Happy · **C2** Edge · **C3** Invalid input · **C4** Permission/isolation · **C5** System/infra · **C6** Concurrency · **C7** State transition · **C8** Catastrophic.

---

## 1. Pyramid allocation

| Layer | Tool | Surfaces | Weight |
|---|---|---|---|
| L1 Schema / pure fn | Vitest | `cycleBuilder*Schema`, `publishCycle*Schema`, `aggregateCycleTailoringStatus`, recommendation ranking pure fns | Heavy |
| L2 Backend / server fn | Vitest + Drizzle (Dockerized PG) + Fastify `inject` | 3 new endpoints + managers + repositories | Heavy |
| L3 Component / UI | Vitest + RTL | cycle board, volunteer rail, recommendation list, swap-vs-both dialog, publish/below-full dialog, Assign button, audit panel | Heavy |
| L4 E2E | Playwright | 6 user-story journeys | Selective |

**Rule**: push permission/isolation, edge, and invalid-input volume down to L1/L2; reserve L4 for whole-journey proof.

---

## 2. Mocking / boundary strategy

- **L1**: pure — no mocks. Feed schemas/functions raw objects.
- **L2**: **integration, not mocked** — R8 mandates a real Dockerized PG with a **two-church (A/B) fixture**. Drive endpoints via Fastify `inject`; RBAC guard exercised for real. Only truly external side-effects (none here — no notifications fire from the builder read/publish paths beyond existing publish behavior) get stubbed. Seed clean state per test (`beforeEach` truncate + factory insert).
- **L3**: mock the orval client hooks (`getCycleBuilderData`, `publishCycle`, `getCycleAuditLog`, single-assignment mutations) at the query boundary; render with the app's TanStack Query + router test providers. Fake timers for the ~30s revalidation.
- **L4**: seed via the existing E2E seeding path (synthetic cycle-year entropy per the project E2E gotchas); real backend; `cd apps/web` for Playwright runs.

---

## 3. Layer 1 — Schema & pure functions

### 3.1 `cycleBuilderResponseSchema` + nested view schemas (contracts §1) — `apps/server/.../cycle-builder.dto.*.test.ts`
- [ ] **C1** valid nested cycle→event→slot→shift payload parses; `included`, `state` present
- [ ] **C2** shift with `assignments: []` and `eligibleVolunteers: []` parses (zero-assignment + published cases)
- [ ] **C2** cycle with zero events → `{ events: [] }` parses
- [ ] **C3** missing `participation.state` rejected; extra/unknown key rejected (`strict`)
- [ ] **C3** wrong types (assignments as object not array) rejected
- [ ] **C2** deeply nested large payload (many events×slots×shifts) parses within bound

### 3.2 `publishCycleBodySchema` / `publishCycleResponseSchema` (contracts §3)
- [ ] **C1** `{ confirmBelowFull: true }` and `{}` (optional) both parse
- [ ] **C3** `confirmBelowFull: "yes"` (wrong type) rejected
- [ ] **C1** response with per-participation outcomes + `belowFull` parses

### 3.3 `aggregateCycleTailoringStatus` — `availabilityFiredForAny` (R6) — `ministry-participation.entity.test.ts`
- [ ] **C1** `firedOrLaterCount > 0` ⇒ `availabilityFiredForAny: true`
- [ ] **C2** `firedOrLaterCount === 0` ⇒ `false`
- [ ] **C2** `eventCount === 0` ⇒ `false` (vacuous-truth guard — the critical off-by-one)
- [ ] **C2** boundary: `firedOrLaterCount === 1, eventCount === 5` ⇒ `Any: true`, `ForAll: false` (relaxed-gate distinction)
- [ ] **C1** `firedOrLaterCount === eventCount` ⇒ both `Any` and `ForAll` true

### 3.4 Recommendation ranking pure fns (R4) — `recommendation-ranking.test.ts`
- [ ] **C1** safe candidates ordered: longest-since-last → fewest-active-in-cycle → alphabetical
- [ ] **C2** tie on both primary keys → stable alphabetical
- [ ] **C2** no eligible volunteers → empty recommendation list (not error)
- [ ] **C2** >5 eligible → capped at 5
- [ ] **C1** hard eligibility filter: non-ministry / unqualified excluded entirely
- [ ] **C1** pending availability → "Needs response" bucket, not safe
- [ ] **C1** unavailability mark / overlapping assignment → "Conflict options" bucket
- [ ] **C2** same-day non-overlapping existing assignment → still safe, ranked lower, workload note present
- [ ] **C2** active-status filter: only draft/pending/confirmed count; declined/cancelled excluded from fairness
- [ ] **C4** fairness scope flag off = cycle-wide history; flag on = ministry-only history (Unleash)

---

## 4. Layer 2 — Backend endpoints (Dockerized PG, two-church fixture)

### 4.1 `GET /leader/cycles/:cycleId/builder` — getCycleBuilderData (R1) — `leader-rostering-controller.builder.integration.test.ts`
- [ ] **C1** returns every event/slot/shift for (ministry, cycle) with assignments nested per shift
- [ ] **C2** zero-assignment shift → `assignments: []`; not-included slot → `included: false`
- [ ] **C2** published participation → its shifts carry `eligibleVolunteers: []` (Query B skipped), assignments still present
- [ ] **C2** mixed-state cycle (some rostering, some published participations) → all returned, states correct
- [ ] **C2** eligible-volunteers batched — assert a single batched read, **no N+1** (query count / spy on the batched path)
- [ ] **C3** missing `ministryId` query param → 400
- [ ] **C3** malformed `cycleId` → 400/404
- [ ] **C4** caller lacks `canManageMinistry` → 403
- [ ] **C4** **church isolation**: church A caller cannot read church B's cycle/ministry → 404 (`NotFoundError`), never B's rows
- [ ] **C5** repository throws (DB error) → 500, no partial leak
- [ ] **C2** cycle with zero events for the ministry → `{ events: [] }`

### 4.2 `POST /leader/cycles/:cycleId/publish` — publishCycle (R7) — `...publish.integration.test.ts`
- [ ] **C1** fully-staffed cycle, `confirmBelowFull` omitted → all participations `published`, `published: true, belowFull: false`
- [ ] **C7** below-full without `confirmBelowFull` → `belowFull: true`, **no state change** (assert every participation still `rostering`)
- [ ] **C1** below-full with `confirmBelowFull: true` → all `published`
- [ ] **C5/C7** transaction atomicity: force a mid-publish failure (one participation errors) → **no** participation published (all-or-nothing rollback)
- [ ] **C4** lacks `canManageMinistry` → 403
- [ ] **C4** church A cannot publish church B's cycle → 404
- [ ] **C6** double-publish (two rapid calls) → second is idempotent/no-op or consistent, never double-transition corruption
- [ ] **C7** publish then reassign a volunteer → allowed (publish is not a lock, FR-023)
- [ ] **C2** cycle with a single participation → publishes correctly (loop-of-one)

### 4.3 `GET /leader/cycles/:cycleId/audit` — getCycleAuditLog (R5) — `...audit.integration.test.ts`
- [ ] **C1** returns cycle-wide audit items (actor/action/timestamp/reason?) for (cycle, ministry)
- [ ] **C2** no audit activity → `{ items: [] }`
- [ ] **C2** reason-less entry → `reason` absent/optional
- [ ] **C4** lacks `canManageMinistry` → 403
- [ ] **C4** church A cannot read church B's audit → 404, no B rows
- [ ] **C2** ordering stable (e.g. timestamp desc) across many entries

### 4.4 Repository church-isolation matrix (R2/R8) — one per new method
- [ ] **C4** `drizzle-ministry-participation` builder aggregation: A cannot see B (Query A **and** Query B)
- [ ] **C4** `drizzle-ministry-participation` batched-publish tx: A cannot mutate B
- [ ] **C4** `drizzle-assignment-audit.listByCycle`: A cannot see B
- [ ] **C1** each method includes `.where(eq(table.churchId, …))` (assert via cross-church negative test, not just code read)

### 4.5 Derived field propagation — `availabilityFiredForAny` (R6)
- [ ] **C1** existing cycle-summary endpoint now returns `availabilityFiredForAny` beside `availabilityFiredForAll`
- [ ] **C2** additive/non-breaking: `availabilityFiredForAll` value unchanged for existing fixtures

---

## 5. Layer 3 — Component / UI (RTL, mocked query boundary)

### 5.1 Cycle board canvas (US1, FR-001/002) — `builder-grid.component.test.tsx` (+ rebuilt components)
- [ ] **C1** renders event lanes → slots → shifts with staffed-vs-required progress
- [ ] **C1** date filter narrows visible dates without refetch
- [ ] **C2** cycle with zero eligible/zero assignments → empty-but-valid board (no crash)
- [ ] **C2** published participation renders read-mostly (no eligible-volunteer suggestions offered)
- [ ] **C5** loading state (query pending) → skeleton/spinner with accessible role
- [ ] **C5** query error → error state, not blank/crash
- [ ] **C7** component unmounts mid-fetch → no state-update-after-unmount warning
- [ ] **A11y** shifts/roles have accessible names; progress meter has label

### 5.2 Volunteer rail + assign interactions (US1, FR-007/008)
- [ ] **C1** search filters eligible volunteers by name
- [ ] **C1** click-to-select then assign fills a role; progress updates
- [ ] **C1** drag-to-assign onto a shift assigns
- [ ] **C7** assigning an already-assigned volunteer → swap-vs-assign-both dialog appears; each branch applies correct outcome
- [ ] **C6** double-click assign (rapid) → single assignment, no duplicate (debounce/disable)
- [ ] **C5** assign mutation errors → optimistic update rolls back, error surfaced
- [ ] **C3** attempt to assign to a full role → blocked or requires explicit action

### 5.3 Recommendation list (US3, FR-010/015/019)
- [ ] **C1** ≤5 recommendations, top highlighted with explicit Accept
- [ ] **C1** Accept assigns exactly the top candidate; no auto-assign anywhere
- [ ] **C1** "Needs response" and "Conflict options" render as separate groups
- [ ] **C7** accepting a conflict option → override-reason capture required before assign (min-length reason)
- [ ] **C2** recommendations recompute after an assignment mutation (from current draft)
- [ ] **C6** revalidation on ~30s timer + window focus (fake timers) → refetch fired, no duplicate assign

### 5.4 Publish + below-full dialog (US2, FR-021/022)
- [ ] **C1** Publish action triggers `publishCycle`
- [ ] **C7** `belowFull: true` response → confirmation dialog; confirm re-calls with `confirmBelowFull: true`
- [ ] **C1** cancel on below-full → no publish, stays editable
- [ ] **C6** double-click Publish → single request (button disabled during flight)
- [ ] **C5** publish error → error surfaced, cycle not shown as published

### 5.5 Assign entry button + gating (US4, FR-024/025/026) — `ministry-cycle-list.component.test.tsx`
- [ ] **C1** `availabilityFiredForAny === true` → enabled **Assign** link to `/scheduling/rostering/$ministryId/$cycleId`
- [ ] **C2** `false` → disabled button with copy "Unlocks once availability has fired for this cycle" (title + aria-label)
- [ ] **C2** fully-published cycle (`Any` still true) → **Assign** stays enabled
- [ ] **C1** testids `ministry-cycle-assign-{link,button}-${id}` present
- [ ] **A11y** disabled state exposes the reason to assistive tech (aria-label), not just `title`

### 5.6 Audit panel (US5, FR-029/030) — `audit-log-panel.component.test.tsx`
- [ ] **C1** opening the panel lazily calls `getCycleAuditLog` (not before open)
- [ ] **C1** renders flat cycle-wide list; `volunteerName` resolved by joining `assignmentId` against loaded assignments
- [ ] **C2** empty audit → empty state
- [ ] **C2** audit entry whose assignment isn't in the loaded set → graceful fallback name (no crash)
- [ ] **C5** audit query error → error state in panel

### 5.7 Mobile responsiveness (US6, FR-031/032)
- [ ] **C1** narrow viewport → board scrolls horizontally, volunteer rail stacks below
- [ ] **C2** no `mobile-interstitial` rendered on any viewport (regression guard — file deleted)

---

## 6. Layer 4 — E2E journeys (Playwright, `cd apps/web`)

- [ ] **US1** open builder for a fired cycle → assign across 2 events → reassign → reload → draft persists (C1/C7)
- [ ] **US2** leave a shift below full → Publish → below-full confirm → confirm → all published → reassign after publish (C1/C7)
- [ ] **US3** open a shift's recommendations → Accept top → assigned; conflict option requires override reason (C1/C7)
- [ ] **US4** row with ≥1 fired → Assign enabled → lands in builder; row with none fired → disabled+copy; legacy `/scheduling/builder-events` + per-event route unreachable (C1/C2)
- [ ] **US5** perform + override several assignments → open audit panel → cycle-wide list with names (C1)
- [ ] **US6** narrow viewport → view + assign + publish succeed; horizontal scroll; stacked rail; no interstitial (C1)
- [ ] **C8 (catastrophic, selective)** backend offline mid-session → builder shows a recoverable error, no data corruption; retry after recovery succeeds

---

## 7. Coverage thresholds (adapt `vitest.config` per repo convention)

| Path | stmts | branches | funcs | lines |
|---|---|---|---|---|
| `apps/server/**/dtos/cycle-builder.dto.*` (schemas) | 100 | 100 | 100 | 100 |
| `apps/server/**/domain/entities/ministry-participation.*` (aggregate fn) | 100 | 100 | 100 | 100 |
| `apps/server/**/{repositories,application}/** (new methods)` | 95 | 90 | 95 | 95 |
| `apps/web/**/components/builder/** (recommendation + canvas logic)` | 85 | 80 | 85 | 85 |

**Enforcement priority**: close uncovered **branches** first — the `eventCount === 0` guard (3.3), the below-full-vs-confirm fork (4.2), the swap-vs-assign-both fork (5.2), and the published-skip fork (4.1) are the highest-risk conditionals.

---

## 8. Traceability (FR → primary scenarios)

| FR | Covered by |
|---|---|
| FR-001/002 canvas + progress | 5.1, 4.1-C1, US1 |
| FR-004 one batched read | 4.1-C1, 4.1 no-N+1 |
| FR-005/007/008 assign/swap/search | 5.2, US1 |
| FR-006 no structure edits | T009a guard test (no structure-mutation call on the builder path; no such endpoint added) + 4.1 read-only |
| FR-010–019 recommendations | 3.4, 5.3, US3 |
| FR-021/022/023 publish | 4.2, 5.4, US2 |
| FR-024/025/026 entry + gating | 3.3, 4.5, 5.5, US4 |
| FR-027/028 retirement | 5.7-C2, US4 legacy-unreachable |
| FR-029/030 audit | 4.3, 5.6, US5 |
| FR-031/032 mobile | 5.7, US6 |
| R2/R8 isolation (cross-cutting) | 4.4, every 4.x-C4 |

---

## 9. Gaps / notes

- **C8 catastrophic** is deliberately thin (one selective E2E) per pyramid economics — full memory-exhaustion/runtime-crash simulation is out of proportion for this feature.
- The **no-N+1** assertion (4.1) needs a query-count spy or PG statement log; wire it into the integration harness (T006) so it's reusable.
- Recommendation revalidation races (5.3-C6) require **fake timers** — do not use real 30s waits.
- Two-church isolation (§4.4) is the single most important class here (multi-tenant safety) and must gate merge — treat any missing C4 test as a release blocker.
