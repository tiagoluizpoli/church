# Phase 0 Research: Event Builder (Cycle-Centric)

**Feature**: `023-event-builder` | **Date**: 2026-07-14

Unlike a greenfield feature, every open decision for this build was already resolved during the wayfinder map [Event Builder (cycle-centric) (#1)](https://github.com/tiagoluizpoli/church/issues/1). Phase 0 therefore **consolidates** those ticket resolutions into research items rather than re-deciding them; each item cites the ticket that holds the full decision record. New research below is limited to grounding the ticket decisions against the current code.

---

## R1 — Cycle-wide builder read endpoint

**Decision**: One new batched read `GET /api/v1/leader/cycles/:cycleId/builder?ministryId=` (`operationId: getCycleBuilderData`) on `LeaderRosteringController`, replacing all three of today's builder load calls (`getCycleParticipation`, legacy event-scoped `getScheduleBuilderData`, and the N+1 `listEligibleVolunteers`) for initial paint. Response is a uniform, event→slot→shift-nested shape; every shift returns `assignments` (`[]` when none) and `eligibleVolunteers` (`[]` when the participation is published). Eligible volunteers are computed in a **separate batched internal query** over all shifts at once (never N+1), skipped for published participations.

**Rationale**: Keeps builder concerns off the tailoring contract (`getCycleParticipation` untouched); one HTTP round-trip; isolates the expensive availability join from the structural aggregation; uniform shape avoids per-shift special-casing.

**Grounding**: Reuses existing atomic schemas — `assignmentResponseSchema` (`assignment.dto.ts`), `eligibleVolunteerResponseSchema` (`rostering.dto.ts:14`), `shiftResponseSchema`/`shiftRequirementResponseSchema`/`participationResponseSchema` (`participation.dto.ts`). RBAC guard `rbacGuard.canManageMinistry({ churchId, ministryId, userId })` — identical to `getCycleParticipation`.

**Alternatives rejected**: overloading `getCycleParticipation` (leaks builder concerns into tailoring); a single mega-join (couples availability to structure); a separate eligible-volunteers HTTP endpoint (extra round-trip / re-introduces N+1). Full record: [#2](https://github.com/tiagoluizpoli/church/issues/2).

## R2 — Whole-cycle canvas layout (desktop + mobile)

**Decision**: Variant G "Cycle board" — full-cycle orientation via compact date cards with staffing progress + date filters; full-width event-grouped lanes with shifts/roles; ranked recommendations at shift/role level; a searchable volunteer rail with click-to-select and drag-to-assign. When a selected volunteer is already assigned elsewhere the leader explicitly chooses **swap** vs **assign to both**. Responsive: horizontal board scroll on narrow screens, volunteer rail stacks below the board. Genuinely responsive — **no** "continue on desktop" interstitial.

**Rationale**: Gives the leader whole-cycle situational awareness (the entire reason for the cycle-centric rebuild) while keeping per-shift assignment ergonomics. Prototype approved: `…/scheduling/rostering/prototype?variant=G`.

**Grounding**: shadcn-first (constitution's Mandatory Frontend Rule) — board/lane/card/rail compose existing primitives. Full record: [#4](https://github.com/tiagoluizpoli/church/issues/4).

## R3 — Legacy builder retirement inventory & cutover

**Decision**: Retire the legacy event-scoped `ScheduleBuilder` / `/scheduling/builder-events` flow and the orphaned per-participation route. Of the `builder/` dir (27 src + 14 test): **7 reuse-as-is** (presentational: `assignee-identity-badge`, `assignment-chip`, `audit-log-panel`, `override-dialog`, `staffing-meter`, `suggestion-list`, `volunteer-card`), **3 reuse-with-rewiring** (`assignment-picker`, `substitution-picker`, `role-count-control` — pool source becomes the cycle-wide endpoint), **10 rebuild** (grid-structural: `schedule-builder`, `schedule-builder-ready`, `builder-grid`, `slot-row`, `builder-header`, `empty-builder-state`, `requirement-cell`, `builder-types`, `use-schedule-builder-controller`(+types), `use-schedule-builder-derived-data`, `volunteer-pool-sidebar`), **4 delete** (F1 slot-management). Retire 3 legacy routes; repoint 4 entry points off `/scheduling/builder-events` (real live one: `ministry-cycle-list.tsx`); migrate 5 e2e specs.

**Cutover ordering**: land backend → build new route additively → repoint entry → migrate e2e → delete legacy.

**Ripple corrections**: (a) `mobile-interstitial.tsx` is **deleted, not reused** (mobile-parity decision, R6 below). (b) `audit-log-panel` moves from *reuse-as-is* to *reuse-with-rewiring* because its data hook changes (R5 below).

**Grounding**: Full inventory asset `manual-planning/0001-volunteer-scheduling/research/legacy-builder-retirement-inventory.md`. Full record: [#5](https://github.com/tiagoluizpoli/church/issues/5).

## R4 — Cycle-wide assignment recommendation ranking

**Decision**: Hard eligibility filter (must belong to ministry + be qualified for role/team). Availability evaluated for the **exact shift** from the volunteer's `AvailabilityCheck` + shift-level unavailability marks: confirmed-with-no-mark = "safe"; pending = "No response", **not** available. Safe candidates ordered by **longest time since last active assignment**, then **fewest active assignments in the current cycle**, then stable alphabetical. A confirmed volunteer already serving a non-overlapping shift the same day stays safe but ranks lower with an inline workload note. Default fairness scope = the **entire planning cycle**; an **Unleash flag** temporarily allows ministry-only history (permanent config deferred to backlog). Active = draft/pending/confirmed count; declined/cancelled/inactive do not. Up to **5** plain-language recommendations per shift/role (never numeric scores); the first is highlighted with an explicit **Accept**; nothing auto-assigns. Pending → "Needs response" group; unavailability/overlap → "Conflict options" requiring the existing override-reason flow. Recalculate from current draft; revalidate batched backend data after mutations, on window focus, and on a ~30s HTTP refresh while open. WebSockets/SSE deferred to `BL-001`. A separate leader response-health report is tracked in `BL-019`.

**Grounding**: Reuses existing availability/eligibility logic behind `listEligibleVolunteers`; `eligibleVolunteerResponseSchema` already carries `isAvailable`/`hasConflict`/`lastServedAt`. Full record: [#6](https://github.com/tiagoluizpoli/church/issues/6).

## R5 — Cycle-wide audit read endpoint

**Decision**: New batched `GET /api/v1/leader/cycles/:cycleId/audit?ministryId=` → `{ items: AssignmentAudit[] }` on `LeaderRosteringController`, reusing existing `auditListResponseSchema`/`assignmentAuditResponseSchema` (no new DTO). New `listAuditLogForCycle({ churchId, cycleId, ministryId })` manager method beside `listAuditLog`; new repo method (`listByCycle`/`listByAssignmentIds`) — today the repo only has `listByAssignment`. `AuditLogPanel` swaps its `Promise.all(assignments.map(getAssignmentAudit))` N+1 for one batched call keyed on cycle+ministry, still lazy on dialog-open; `volunteerName` resolved by joining `audit.assignmentId` against already-loaded builder assignments (no per-item fetch).

**Rationale**: The per-assignment `Promise.all` N+1 does not scale to whole-cycle. **Factual correction to the map's fog note**: a per-assignment audit endpoint already exists (`GET /admin/assignments/:assignmentId/audit`, `admin-leader-controller.ts:410`) and stays; the question was whether whole-cycle scope justifies a batched variant — it does.

**Grounding**: `AssignmentAudit` entity + `drizzle-assignment-audit.repository.ts` already exist. Full record: [#7](https://github.com/tiagoluizpoli/church/issues/7).

## R6 — Entry point copy + availability gating

**Decision**: On each cycle row (`ministry-cycle-list.tsx`), the retired **Builder Events** button becomes **"Assign"** (avoids the "Roster"/`rostering` overload; the neighboring tailoring button is already "Roster"). Gating **relaxes** from `availabilityFiredForAll` to **any availability fired** (≥1 event/participation). Disabled copy → **"Unlocks once availability has fired for this cycle"** (leader/admin-facing screen — the domain verb "fired" is kept, not softened). Testids → `ministry-cycle-assign-{link,button}-${id}`. The button **stays enabled on fully-published cycles**.

**New signal**: `availabilityFiredForAny = firedOrLaterCount > 0`. `firedOrLaterCount` is already computed inside `aggregateCycleTailoringStatus` (`ministry-participation.ts:80`, today emitting only `availabilityFiredForAll: firedOrLaterCount === eventCount`), so this is a trivial add down the existing chain: `CycleTailoringStatusResult` → `ministry-participation.repository` view → `participation.dto` → `TailoringCycleSummary` (`churchAPI.schemas.ts`) → `cycle-list.utils.ts`. The `eventCount === 0` special-case must yield `availabilityFiredForAny: false` (same vacuous-truth guard the `ForAll` field already has).

**Rationale**: Firing availability is the leader's signal they have committed real assignable structure for ≥1 event; completeness is irrelevant. Consistent with the confirm-below-full Publish philosophy (R7). Full record: [#8](https://github.com/tiagoluizpoli/church/issues/8).

## R7 — Cycle-wide batched Publish

**Decision** (map standing decision, [#1](https://github.com/tiagoluizpoli/church/issues/1) Notes): One cycle-wide **Publish** action, implemented as a **batched multi-`MinistryParticipation` publish under the hood** via a new endpoint, e.g. `POST /api/v1/leader/cycles/:cycleId/publish?ministryId=` with body `{ confirmBelowFull?: boolean }`. Gating is **confirm-below-full, not a hard block** — the same escape hatch the existing per-participation `publishParticipation` already has (`publishParticipationBodySchema.confirmBelowFull`). Publishing does not lock the cycle against further individual reassignment.

**Rationale**: The builder's unit is the whole cycle for one ministry; per-participation publish would defeat the single-action goal. Reuses the existing publish domain rule (below-full confirmation) applied atomically across every participation in the (cycle, ministry).

**Open sub-question for Phase 1 design** (mechanism, not scope): whether the batched publish is one transaction over all participations or a per-participation loop with partial-failure isolation. **Resolved in data-model.md**: single `db.transaction()` (R2 mandates transactions for complex writes; all-or-nothing publish is the correct semantic — a half-published cycle is a worse state than a failed publish the leader can retry).

## R8 — Backend layering, isolation & testing (constitution VI / R2)

**Decision**: All three new endpoints follow the existing `LeaderRosteringController` pattern (Fastify route + Zod DTO + RBAC guard + application-manager method + Drizzle repository method), per constitution II. Per `specifications/R2-drizzle-repos.md` (traversed via `specifications-list.md` for Principle VI): (1) every new query includes church isolation (`.where(and(eq(table.churchId, churchId), …))` / `withChurchIsolation`); (2) prefer Drizzle relational query API where it fits — the builder read's multi-table grouped aggregation may need explicit `db.select()`/joins, which R2 permits ("where possible"); (3) `db.transaction()` for the batched publish write (R7), not for the read endpoints; (4) **integration tests against a real Dockerized PostgreSQL are mandatory**, including a two-church (A/B) isolation test proving church A's repository call cannot see church B's rows.

**Rationale**: This is `023`'s backend surface; the same R2 mandate that Iteration 3 of `022` folded in applies here. Full precedent: `specs/022-tailoring-workspace/plan.md` Iteration 3 re-check.
