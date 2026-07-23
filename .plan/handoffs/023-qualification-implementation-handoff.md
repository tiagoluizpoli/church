# Handoff: 023 qualification + multi-team implementation

Date: 2026-07-22
Branch: `023-event-builder`
Repo: `/home/tiago/01-dev-env/personal-repos/church/church`
Status: **Phase 1 complete and green. Phase 2 code complete, gate blocked on an
unapplied migration.**

Read these three first, in order:

1. `.plan/handoffs/qualification-and-multi-team-model.md` — the ten locked
   design decisions. Do not relitigate them.
2. `.plan/handoffs/023-spec-drift-log.md` — divergences recorded so far.
3. `agents.local.md` — coding rules. They apply in full; this is real code.

## Framing (important — do not deviate)

- **No Spec Kit.** Do not run `speckit-specify`, `speckit-plan`, or
  `speckit-tasks`. This is a refinement of the existing 023 cycle-builder /
  assigning page, not new scope.
- **Implementation first, specification second.** Do not edit anything under
  `specs/023-event-builder` while implementing. Append every divergence to
  `.plan/handoffs/023-spec-drift-log.md` instead. The spec gets amended at the
  end, based on what was actually built.
- **Do NOT build the ministry-members management screen.** It does not exist
  yet. The whole volunteer-management CRUD surface — creating/editing/removing
  volunteers, editing role qualifications or team membership through the UI —
  is a separate future feature. Handoff decision 8 records the design intent
  only. Qualification data comes from seeds for now. Same for any bulk
  role-assignment UI.
- Do not refactor the two assignment paths into one service.
- Conventional Commits. **No `Co-Authored-By` trailer.**

## The immediate next action

The phase-2 gate fails on three `@church/db` tests, all with the same error:

```
error: relation "ministry_volunteer_team" does not exist
```

Migrations `0010` and `0011` exist on disk but have not been applied to the
local/test database. This is **not** a code defect. Run:

```bash
cd packages/db
bun run db:migrate      # or db:push against the dev DB
bun run db:setup-test   # test database
```

Then re-run the gate from the repo root:

```bash
bun run check && bun run check-types && bun run test
```

`bun run check` and `bun run check-types` were **passing** as of the last run
(4/4 tasks). Only those three DB tests fail, and only for the missing tables.
The failing tests are `packages/db/tests/seed.test.ts` (T007, T008) and
`packages/db/tests/schema/core.test.ts` (Contextual Leadership SC-004).

Note: `bun run test` runs the whole turbo suite and takes ~5 minutes.
`bun run test:e2e` has **not** been run for phase 1 or 2 yet — the user
explicitly agreed to skip it for phase 1. Run it once phase 2 is green.

## What phase 1 did (complete, gates passed)

`packages/db/src/schema/core.ts`:

- Added `ministryVolunteerRole` — `(id, churchId, ministryVolunteerId, roleId,
  createdAt)` with `uniqueIndex(ministryVolunteerId, roleId)`. Hung off the
  **membership**, not the volunteer.
- Added `ministryVolunteerTeam` — same shape with `teamId`. Flat many-to-many,
  no primary team.
- `packages/db/src/schema/index.ts` re-exports `*`, so no export edit was needed.

Migration `packages/db/src/migrations/0010_old_rockslide.sql` — purely
drizzle-kit generated, zero hand edits. There is deliberately **no data
backfill**: the user confirmed no production data exists and the seeds populate
everything.

## What phase 2 did (code complete, unverified past check-types)

### Two fake predicates replaced

`apps/server/src/infrastructure/repositories/drizzle-volunteer.repository.ts`:

- `listQualifiedForRole` previously joined `role` with **no predicate tying the
  role to the volunteer** — it returned every active non-leader member. It now
  joins through `ministryVolunteerRole` and, per decision 5, **no longer
  excludes leaders** (`systemRole` governs who may edit a cycle, not who may
  serve).
- `hasRoleQualification` was a second fake: it returned true when the volunteer
  was merely an active member of the ministry owning the role. It now requires a
  real `ministry_volunteer_role` row.
- `listMinistryMemberships` now issues three scoped queries and groups them with
  a local `groupByMembership` helper, returning teams and qualified roles per
  membership.

### Contract change

`apps/server/src/domain/contracts/infrastructure/volunteer.repository.ts` —
`MinistryMembership` changed from `teamId: string | null` to:

```ts
teamIds: string[];
qualifiedRoleIds: string[];
```

`qualifiedRoleIds` was added here (rather than in phase 4) so the builder
payload can be fed from one query. **Phase 4 still has to surface it on
`ScheduleBuilderVolunteerOption` and regenerate the client types.**

### Column dropped

`ministry_volunteer.team_id` is gone. Migration
`packages/db/src/migrations/0011_aromatic_kate_bishop.sql`, also purely
generated. Note this happened in phase 2, not phase 1 — see drift-log item 1 for
why.

### Readers migrated

- `apps/server/src/domain/entities/ministry-volunteer.ts` — dropped the `teamId`
  prop and getter and the `assignTeam` / `removeTeam` mutators (both had **zero
  callers**; the entity is only constructed in tests).
- `apps/server/src/application/db-event-manager.ts` — sub-leader scoping is now
  a set intersection: a sub-leader may lead several teams.
- `apps/server/src/application/db-volunteer-manager.ts` — added a
  `coversRequirementTeam` helper. **Behaviour change, needs a drift-log entry:**
  a team-less requirement now counts any member, where it previously counted
  only members whose single team was null. The new rule is the correct
  composition per decision 1.
- `apps/server/src/scripts/seed-dev-users.ts` — `ensureMembership` takes
  `teamIds: string[]` and writes junction rows idempotently (delete-then-insert).
- `apps/server/src/test-support/e2e-seed.ts` — memberships and team rows are now
  separate inserts sharing a `poolMembershipId(index)` helper.
- `packages/db/src/seed/factories/volunteer.factory.ts`,
  `packages/db/src/scripts/seed-volunteer-dashboard-demo.ts`,
  `packages/db/tests/schema/core.test.ts` — same pattern.

### API field renamed

`callerTeamId: string | null` → `callerTeamIds: string[] | null`, because a
sub-leader can now lead several teams. Touched:

- `apps/server/src/domain/contracts/application/event-manager.ts`
- `apps/server/src/api/dtos/event.dto.ts`
- `apps/web/src/infrastructure/api/churchAPI.schemas.ts` (hand-edited; it is a
  generated file and phase 4 will regenerate it)
- `apps/web/src/features/scheduling/hooks/use-schedule-builder.ts`
- Test fixtures in `apps/web` (2 files, 29 occurrences) and `apps/server`
  (`tests/application/db-event-manager.test.ts`, `tests/dtos/event.dto.test.ts`)

**Watch out:** a regex pass over the server test fixtures briefly renamed
`SlotRequirement.teamId` by mistake. It was caught and reverted at
`apps/server/tests/dtos/event.dto.test.ts:112` and `:221`. `slot_requirement`
keeps its own singular `teamId` column — that is a different concept from
membership teams and must not be renamed.

### Not touched, deliberately

`apps/server/tests/contract/repositories/volunteer.repository.test.ts` — its
mock already modelled qualification as an explicit set. The mock was always
right; only the Drizzle implementation lied. No edit needed.

## A stale fact in the original handoff — correct this

`qualification-and-multi-team-model.md` finding 2 claims
`db-assignment-manager.createParticipationAssignment` "never calls"
`validateHardConstraints` and does not enforce qualification. **That is wrong as
of the current code.** At `apps/server/src/application/db-assignment-manager.ts`
around line 235 it already calls `hasRoleQualification` and throws
`HardConstraintError('NOT_QUALIFIED')` unconditionally.

The consequence for phase 3: enforcement is not missing, it was merely
**toothless** because `hasRoleQualification` was a no-op. Fixing the repository
in phase 2 activates it. So phase 3 is not "wire in the check" — it is "make the
existing check respect `enforcementType` and the override reason", per
decision 7: `hard` blocks unless `input.override?.reason` is supplied, `soft`
warns only. Mirror the `DUPLICATE_ASSIGNMENT` pattern already in that file
(around line 312).

Be aware this means the phase-2 change alone may start failing assignment tests
that relied on qualification always passing. Check that when the gate runs.

## Remaining phases

3. **Enforcement** — as described directly above. Also feed
   `assignment-manager-service` a real `volunteerQualifiedRoleIds` supplier
   instead of an empty list; it already calls `validateHardConstraints`.
4. **API** — add `qualifiedRoleIds: string[]` and `teamIds: string[]` to
   `ScheduleBuilderVolunteerOption`, then regenerate
   `apps/web/src/infrastructure/api/churchAPI.schemas` (the `callerTeamIds`
   hand-edit should fall out of the regeneration).
5. **Seeds** — give seeded volunteers sensible role qualifications. Team
   memberships were already migrated in phase 2; role qualification rows are
   **not seeded anywhere yet**, which means every qualification check currently
   returns false against seeded data. Files:
   `apps/server/src/scripts/seed-dev-users.ts`,
   `apps/server/src/test-support/e2e-seed.ts`,
   `packages/db/src/seed/factories/volunteer.factory.ts`.
6. **Web** — roles line on the volunteer card ("Ana: Slides · Camera") and
   qualification-filtered candidates per slot on the assigning page.

## Process rules for each phase

- Single-object parameters; every object shape gets a named `interface`/`type`;
  no inline object typing in touched files.
- No linter or compiler suppression directives without asking the user first.
- Backend: DDD + Clean Architecture, strict `church_id` multi-tenant isolation.
- After each phase: `bun run check`, `bun run check-types`, `bun run test`,
  `bun run test:e2e`, then review the modified files and fix everything found
  before starting the next phase.
- Stop for user review at the end of each phase.

## Uncommitted state

Nothing has been committed. `git status` will show modifications across
`packages/db`, `apps/server`, and `apps/web`, plus untracked
`packages/db/src/migrations/0010_old_rockslide.sql`,
`0011_aromatic_kate_bishop.sql`, and the two `.plan/handoffs` files. There is
also unrelated pre-existing work in
`apps/web/src/features/scheduling/components/cycle-board-prototype/` — a
throwaway design prototype. Leave it alone and keep it out of any commit for
this feature.
