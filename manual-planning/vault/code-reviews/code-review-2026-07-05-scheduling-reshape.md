# Scheduling Reshape Code Review — 2026-07-05

Scope: follow-up pass on the 2026-07-04 review. Fixes all three findings from that report, closes the T079 coverage gate, then runs a fresh Standards + Spec review of the resulting diff (uncommitted working tree vs `HEAD` at `3e6b7ba`, i.e. `git diff HEAD -- apps/server apps/web packages/db`).

## Fixes applied to the 2026-07-04 findings

### 1. High — leader-side assignment deletion (fixed, with a caveat — see Spec finding below)

- `DbAssignmentManager.deleteAssignment()` now wraps the audit-row insert and the assignment delete in a single `unitOfWork.run(tx => ...)` transaction, writing the audit entry **before** deleting the row (`apps/server/src/application/db-assignment-manager.ts`). The FK-violation-on-insert bug is gone; the leader delete flow no longer fails.
- `actorId` is now a required field (`DeleteAssignmentInput`, `apps/server/src/domain/contracts/application/assignment-manager.ts`) instead of optional, so the "no audit written" code path can no longer exist.
- Regression test updated: `apps/server/tests/application/scheduling-phase7.live-changes.test.ts` — `deleteAssignment succeeds without an FK violation and removes the assignment row`.

### 2. Medium — admin schedule-builder delete path skipping audit logging (fixed)

- `admin-leader-controller.ts`'s delete route now passes `actorId: UserId.from(request.userId)`, matching the leader route. Both delete paths are now uniform.

### 3. Medium — coverage gate red (fixed — all three buckets now pass)

- `src/domain/**` (100% required): root cause was pure type-only/interface files (`**/types.ts`, `domain/contracts/application/**`, repository/notification-service interfaces) being included in the coverage glob and reporting 0% since they have zero runtime statements. Excluded them in `vitest.config.ts` — legitimate, verified each file has no `export const/function/class/enum` before excluding. Also found two **real** gaps and fixed the underlying dead code rather than papering over it:
  - `domain/services/availability-overlap.ts`: rewrote the double loop with `.entries()`/`.slice()` instead of manual indexing, removing an unreachable `!first || !second` guard that existed only to satisfy `noUncheckedIndexedAccess`.
  - `domain/services/cycle-event-generator.ts`: same shape — destructured `firstSlot`/`lastSlot` and merged the empty-slots guard with the narrowing check instead of two separate (one dead) checks.
  - `domain/contracts/contract-tests/*.contract-spec.ts` (9 files): every one had a `cleanup: () => Promise<void> = async () => {}` default parameter that **no caller anywhere in the codebase ever relied on** (verified by grep — all call sites pass an explicit cleanup). Removed the dead default, made the param required.
- `src/application/**` (90% branches required, was 88.86%): added 5 targeted tests hitting real, previously-unexercised branches — an already-locked cycle being locked again (`archived`-guard), an event created after its cycle is already locked (both in `generateFromTemplates` and manual `createEvent`), and an `updateShift` call that omits `label`. Final: 90.13%.
- `src/infrastructure/repositories/**` (85% branches required, was 82.06%): delegated to a subagent (mechanical, repetitive not-found/empty-array/tx-optional branch coverage across ~15 Drizzle repository files). Added/extended coverage test files across `assignment`, `planning-event`, `availability-check`, `church`, `event`, `event-template`, `ministry-participation`, `planning-cycle`, `team`, `volunteer`, `time-slot`, `shift`, `assignment-audit` repositories. Final: 93.72%. ~25 branches remain genuinely dead (Drizzle `.returning()` null-check after a successful insert, aggregate `?? 0` fallbacks Postgres always satisfies, FK-guaranteed non-null joins) — confirmed by reading source, not gamed.

Full coverage run is now green across `api/dtos`, `domain`, `application`, and `infrastructure/repositories` with no threshold errors.

## Fresh review of the resulting diff

### Standards axis

**Hard violation, fixed**: `deleteAssignment`'s inline object parameter type (`input: { assignmentId; churchId; actorId }`) broke the repo's Explicit Parameter Contract rule (`.specify/memory/constitution.md` Principle VII / `agents.local.md` "Parameter Contract Rule" — inline object typing forbidden in modified code). Extracted named types (`DeleteAssignmentInput`, `GetAssignmentInput`, `OverrideAssignmentInput`, `ListAssignmentAuditLogInput`) in `assignment-manager.ts` and updated the implementation to match, since all four methods live in the same touched file.

**Judgement calls, no action needed**:
- The three fields `{ assignmentId, churchId, actorId }` recur across `deleteAssignment`/`overrideAssignment`/`getAssignment` — a shared `AssignmentRef` type could remove the duplication, but it's a minor clump, not a defect.
- `domain/conflict/types.ts` and `domain/contracts/infrastructure/volunteer.repository.ts` dropped unused runtime arrays (`HARD_CONSTRAINT_REASONS`, `SOFT_CONFLICT_TYPES`, `MINISTRY_SYSTEM_ROLES`) in favor of plain string-literal unions — confirmed zero other references, safe dead-code trim.
- Deleted `infrastructure/repositories/*.mapper.ts` files were orphaned duplicates of the still-used `infrastructure/mappers/*.mapper.ts` — safe, zero remaining importers.

### Spec axis

**Central finding — the delete fix does not actually preserve an audit trail.** `packages/db/src/schema/assignments.ts` declares `assignmentAudit.assignmentId` as `references(() => assignment.id, { onDelete: 'cascade' })`. Because the audit insert and the assignment delete run in the *same* transaction, Postgres cascade-deletes the just-written audit row the instant `deleteById` executes — the insert never survives the commit. This is documented and asserted by the updated test itself (`expect(audit).toEqual([])` after a successful delete). So the 2026-07-04 report's stated impact — "undermines the audited-change expectations introduced in US4/US5" — is **still true**. What changed: the request no longer errors, and both delete paths (leader and admin) now behave identically (previously inconsistent). This is a pre-existing schema decision, not something introduced by this diff, and fixing it for real would need a schema migration (e.g. decoupling `assignment_audit` from `ON DELETE CASCADE`) — a product decision, not something to silently change. **Recommend re-opening this with spec/PRD owners before treating US4/US5's audit requirement as closed.**

No scope creep found. The `db-planning-cycle-manager.ts` advisory-lock addition is pre-documented in `tasks.md` (T076/DL4-X3) and in scope.

## Additional finding — discovered and fixed during this session's own verification

**E2E cross-spec test isolation gap** (not part of the reviewed diff's original scope, but newly *exposed* by a config change made this session): `apps/web/playwright.config.ts` workers were reduced from `3` (local) to `1`, per a direct request to cut Chromium memory/CPU usage during test runs. This made spec-file execution order fully deterministic and surfaced a pre-existing bug: `us2-leader-tailor.spec.ts` fires availability for "ministries[0]" (which resolves to the same shared `E2E Worship` ministry `us3-volunteer-availability.spec.ts` uses), in its own separate cycle. The volunteer's availability dashboard lists pending checks across *all* cycles, so `us3`'s flat `toHaveCount(2)` assertion on `availability-check-card` intermittently (now deterministically) saw 3 cards instead of 2.

Fixed in `us3-volunteer-availability.spec.ts` by scoping the assertion to both ministry name **and** the test's own uniquely-generated cycle name, rather than asserting a flat total — makes the test robust to unrelated pending checks from any other spec, regardless of execution order. Verified with three full `bun run test:e2e` runs: reproduced deterministically before the fix (21 passed/1 failed), green after (22 passed/1 skipped/0 failed).

## Verification

- `bun run check-types` — passed
- `bun run check` (biome) — passed (10 files auto-formatted, no logic changes)
- `bun --env-file=../../.env run vitest run --coverage` in `apps/server` — passed, 106 files / 691 tests, all threshold gates green
- `bun run test:e2e` — passed, 22 passed / 1 skipped (the pre-existing `test.fixme` for the Unleash-flag-toggle limitation, unrelated to this session)

## Status Call

- T080 safeguard sweep: fully green.
- T079 coverage gate: closed.
- New residual risk carried forward: assignment deletion still has no durable audit trail (schema-level `ON DELETE CASCADE`) — flagged above, needs a product/spec decision, not closed by this diff.
