# Handoff — Event Builder (023) `/speckit-implement`

**Branch**: `023-event-builder` · **Date**: 2026-07-14 · **Session stopped at**: ~77% session usage (paused before the 96% cutoff per operator instruction).

Resume by re-running `/speckit-implement` (or continue the task list in [tasks.md](./tasks.md)). Read [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/leader-rostering-endpoints.md](./contracts/leader-rostering-endpoints.md) for design; obey `agents.local.md` (single-object params, named types, no linter suppression, shadcn-only UI, per-phase gate loop).

## What is DONE and VERIFIED

Two complete, independently-testable **backend** slices. Server `bun run check-types` clean, web `bun run check-types` clean, targeted vitest green, biome clean on all touched files. **No commits made yet** — working tree holds the changes.

### 1. US1 — Cycle-builder read endpoint `GET /api/v1/leader/cycles/:cycleId/builder?ministryId=` (`getCycleBuilderData`)
- **DTO** [apps/server/src/api/dtos/cycle-builder.dto.ts](../../apps/server/src/api/dtos/cycle-builder.dto.ts) — `cycleBuilder*Schema` composing existing atomic schemas, `cycleBuilderMapper.toResponse`, **plus** `publishCycleBodySchema`/`publishCycleResponseSchema` (already written for US2 — not yet wired to a route).
- **Contract types** [participation-manager.ts](../../apps/server/src/domain/contracts/application/participation-manager.ts) — `GetCycleBuilderDataInput`, `CycleBuilderView`/`…EventView`/`…SlotView`/`…ShiftView`, `getCycleBuilderData` on `IParticipationManager`.
- **Manager** [db-participation-manager.ts](../../apps/server/src/application/db-participation-manager.ts) — `getCycleBuilderData` (Query A stitch mirroring `getCycleParticipation` + assignments per shift) and private `listEligibleVolunteersForShifts` (**Query B, batched — the N+1 fix**: marks/assignments/qualified fetched once across all shifts; skipped when `participation.state === 'published'`). Extracted shared free fns `buildEligibleForVolunteer`, `sortEligibleVolunteers`, `buildBuilderEventView`, `dedupeVolunteersById`; **refactored the existing `listEligibleVolunteers` to reuse them** (behavior-preserving — phase6 ranking test still green).
- **Controller** [leader-rostering-controller.ts](../../apps/server/src/api/controllers/leader-rostering-controller.ts) — new `GET /cycles/:cycleId/builder` route, `canManageMinistry` guard + `ministryId` query (mirrors `getCycleParticipation` in `leader-controller.ts`).
- **orval regen** done → `getCycleBuilderData` in [apps/web/src/infrastructure/api/admin.ts].
- **Integration test** [apps/server/tests/application/event-builder.rostering.integration.test.ts](../../apps/server/tests/application/event-builder.rostering.integration.test.ts) — uniform shape, `assignments: []`, published⇒`eligibleVolunteers: []`, two-church A/B isolation. **3/3 green.**

### 2. US4 (backend only) — `availabilityFiredForAny` derived field
Full chain: domain `aggregateCycleTailoringStatus` ([ministry-participation.ts](../../apps/server/src/domain/entities/ministry-participation.ts), `firedOrLaterCount > 0`, `eventCount===0 ⇒ false`) → repo `MinistryCycleSummaryRow` + drizzle summary row → manager `MinistryCycleSummaryView` + mapping → `participation.dto.ts` schema+mapper → **orval regen** → web `TailoringCycleSummary` → view-model [cycle-list.utils.ts](../../apps/web/src/features/scheduling/components/tailoring/cycle-list.utils.ts). 4 web test fixtures updated for the new required field.
- **Integration test** added to [ministry-participation.repository.coverage.test.ts](../../apps/server/tests/integration/repositories/ministry-participation.repository.coverage.test.ts) (partial-fired ⇒ ForAny true/ForAll false; zero-event ⇒ false). **12/12 green.**

### Foundational
- Shared DTO (above), route shell [apps/web/src/routes/scheduling/rostering/$ministryId/$cycleId.tsx](../../apps/web/src/routes/scheduling/rostering/$ministryId/$cycleId.tsx) (placeholder `data-testid="event-builder-route"` — replace with the canvas in US1 frontend), test harness = **reuse existing** `apps/server/tests/scheduling-reshape/setup.ts` (`seedSchedulingPhase3Base`, `createSchedulingPhase3Cycle`, `createSchedulingPhase3EventGraph`, churchA/B + ministryA/B) — do not build a new one.

### 3. US2 (backend only) — Batched `publishCycle` `POST /api/v1/leader/cycles/:cycleId/publish?ministryId=`
Contract types + `publishCycle` on `IParticipationManager`; manager method in [db-participation-manager.ts](../../apps/server/src/application/db-participation-manager.ts) — single `unitOfWork.run` transaction (all-or-nothing), publishes only `availability_fired`/`rostering` participations (tailoring skipped, published reported unchanged), below-full pre-check returns `published:false, belowFull:true` with **no writes** unless `confirmBelowFull`; extracted shared `notifyParticipationPublished` helper (refactored the single `publish` to reuse it — phase6 publish test green). DTO `publishCycleMapper`; controller route; orval regen. **Integration test** (below-full guard / confirm-publishes-all / two-church isolation) in the same test file. **6/6 green** with US1.

### 4. US5 (backend only) — Cycle-wide audit `GET /api/v1/leader/cycles/:cycleId/audit?ministryId=` (`getCycleAuditLog`)
Reuses existing `auditListResponseSchema` (no new DTO). Repo `listByCycle` ([drizzle-assignment-audit.repository.ts](../../apps/server/src/infrastructure/repositories/drizzle-assignment-audit.repository.ts), join audit→assignment→participation→event, church-isolated) + contract; manager `listAuditLogForCycle` on `IAssignmentManager`; controller route; orval regen; mock stub added to the contract test. **Integration test** (cycle-wide + isolation) **green (7/7 suite)**.

tasks.md marked `[X]`: T001–T007, T010–T014, T022, T024–T026 (US2 backend), T036, T038–T040, T046–T049 (US5 backend).

**Remaining on US2**: T023 (e2e), T027 (publish UI in canvas), T028 (gate loop). **On US5**: T050 (`audit-log-panel.tsx` rewire to `getCycleAuditLog` + client-side name join), T051 (gate loop).

## What is NOT done (pick up here, in tasks.md order)

- **US1 frontend canvas (T008, T009, T009a, T015–T021)** — the big one. Rebuild 10 grid components + rewire 3 + reuse 7 in `apps/web/src/features/scheduling/components/builder/` per [legacy-builder-retirement-inventory.md](../../manual-planning/0001-volunteer-scheduling/research/legacy-builder-retirement-inventory.md); wire the `$ministryId/$cycleId` route to `getCycleBuilderData`; assign/remove/reassign via existing single-assignment endpoints; volunteer rail. **impeccable** skill is in the squad — use it for the canvas.
- **US2 publish — backend DONE.** Remaining: T027 publish UI (single Publish action + below-full confirm dialog re-calling with `confirmBelowFull:true`), T023 e2e, T028 gate.
- **US3 recommendations (T029–T035)** — client-side ranking on already-fetched builder data (no new endpoint). R4 rules in research.md.
- **US4 entry + retirement (T041–T045)** — Assign button gated on `availabilityFiredForAny` (field is ready); repoint 4 entry points off `/scheduling/builder-events`; migrate 5 e2e specs; delete legacy routes/files. Retirement lands LAST per R3 cutover.
- **US5 audit — backend DONE.** Remaining: T050 `audit-log-panel.tsx` rewire (`getCycleAuditLog`, query key `['cycle-audit', cycleId, ministryId]`, `enabled: open`, join `assignmentId` for `volunteerName`), T051 gate.
- **US6 mobile (T052–T055)**, **Polish (T056–T058)**.

## Gotchas / notes
- **No commits yet** — consider committing the two done slices before starting frontend (conventional commits; **no Co-Authored-By** per user preference).
- `getCycleBuilderData`/`publishCycle` operate over **all cycle events for the ministry** via `getOrCreateParticipation` (same set `getCycleParticipation` shows) — consistent by design.
- orval regen flow: `cd apps/server && bun --env-file=../../.env run src/scripts/export-openapi.ts` then `cd <root> && bun run orval`. Never hand-edit `apps/web/src/infrastructure/api/`.
- Integration/vitest needs `bun --env-file=../../.env run vitest run <path>` from `apps/server`; church-db Docker container must be up (it is).
- Per-phase gate loop still owed on the frontend work: `bun run check` / `check-types` / `test` / `test:e2e` + `/review`.
- Operator wants a usage check (`claude -p "/usage" | grep "Current session:"`) after tasks and a fresh handoff if it nears 96%.
