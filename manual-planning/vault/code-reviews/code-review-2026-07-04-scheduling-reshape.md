# Scheduling Reshape Code Review — 2026-07-04

Scope: Spec 017 scheduling reshape surface, including already-committed server/web/test work and the final safeguard sweep run on 2026-07-04.

## Findings

### 1. High — leader-side assignment deletion is currently broken and can still partially mutate data

- `DbAssignmentManager.deleteAssignment()` deletes the assignment row before it writes the audit entry, and it does so outside a transaction: `apps/server/src/application/db-assignment-manager.ts:94-107`.
- The leader roster route always passes `actorId`: `apps/server/src/api/controllers/leader-rostering-controller.ts:193-207`.
- That means the common leader delete flow hits the `assignment_audit -> assignment` foreign-key constraint after the row is already gone. The regression is already captured by a DB-backed test: `apps/server/tests/application/scheduling-phase7.live-changes.test.ts:836-850`.
- User impact: a leader can get a failing delete request even though the assignment was already removed underneath them, which is exactly the kind of partial-state bug Phase 8 is supposed to prevent.

### 2. Medium — the legacy admin schedule-builder delete path silently skips audit logging

- The old admin delete route still calls `deleteAssignment()` without `actorId`: `apps/server/src/api/controllers/admin-leader-controller.ts:395-405`.
- The web schedule-builder hook still uses that legacy endpoint: `apps/web/src/features/scheduling/hooks/use-schedule-builder.ts:116-119`, `apps/web/src/infrastructure/api/admin.ts:195-201`.
- Because `DbAssignmentManager.deleteAssignment()` only writes an audit row when `actorId` is present, admin-side assignment deletions leave no audit trail at all: `apps/server/src/application/db-assignment-manager.ts:99-107`.
- User impact: assignment history is inconsistent depending on which UI path performed the deletion, which undermines the audited-change expectations introduced in US4/US5.

### 3. Medium — the configured coverage gate is still red, so T079 is not actually complete

- The server coverage thresholds are strict and enabled in config: `apps/server/vitest.config.ts:11-47`.
- Running `bun --env-file=../../.env run vitest run --coverage` from `apps/server` failed on 2026-07-04.
- The reported threshold misses were:
  - `src/domain/**`: lines/functions/statements/branches below the required 100%.
  - `src/application/**`: branches `88.65%` vs required `90%`.
  - `src/infrastructure/repositories/**`: branches `82.21%` vs required `85%`.
- The coverage output also showed several included files at `0%`, notably:
  - `apps/server/src/domain/assignment/types.ts`
  - `apps/server/src/domain/availability/types.ts`
  - `apps/server/src/domain/conflict/types.ts`
  - `apps/server/src/domain/contracts/application/*.ts`
  - `apps/server/src/infrastructure/repositories/types.ts`
- User impact: the implementation is functionally green, but the feature still fails its declared coverage gate and should not be marked fully closed yet.

## Residual Risks

- The same non-transactional pattern used by `deleteAssignment()` also exists in the legacy `createAssignment()` path (`apps/server/src/application/db-assignment-manager.ts:54-68`). I did not catch an active failure there in this pass, but it has the same audit-consistency shape.
- DB-backed tests still emit `pg` deprecation warnings about calling `client.query()` while the client is already busy. This did not fail the suite, but it is worth cleaning up before it turns into a harder runtime constraint.

## Verification

- `bun run check` — passed
- `bun run check-types` — passed
- `bun run test` — passed
- `bun run test:e2e` — passed (`22 passed`, `1 skipped`)
- `bun --env-file=../../.env run vitest run --coverage` in `apps/server` — failed threshold gate

## Status Call

- T080 safeguard sweep: executed, but not all-green because the coverage gate is still red.
- T079 coverage gate: still open.
