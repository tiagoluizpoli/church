# Handoff: Volunteer Qualification + Multi-Team Model

Date: 2026-07-22
Branch: 023-event-builder
Status: design-complete (all open questions resolved), ready to Spec Kit
Scope: Server/schema feature. Adds the missing volunteer→role qualification
link, and converts ministry membership from one team to many.

## Why this exists

The volunteer-card graduation (see `volunteer-card-graduation.md`) needs a
"roles" line — "Ana: Slides · Camera". Investigation showed **nothing in the
database records which roles a person can fill**, so that line had no source.
This is the feature that creates it.

## Established facts (verified in code, do not re-investigate)

Schema today (`packages/db/src/schema/core.ts`, `scheduling.ts`):

- `ministry` — `enforcementType: soft | hard`, `defaultDirection`
- `team` — `(id, churchId, ministryId, name)`. A subgroup **within** a ministry
  (user's example: Kids → "2-4 yrs", "5-14 yrs").
- `role` — `(id, churchId, ministryId NULLABLE, name, isGlobal)`. Ministry-scoped
  and leader-defined, plus global/church-wide roles.
- `ministry_volunteer` — `(volunteerId, ministryId, teamId NULLABLE SINGLE
  COLUMN, systemRole: leader|sub_leader|volunteer, status)`.
  **No roleId. This is the gap.**
- `slot_requirement` — `(shiftId, roleId NOT NULL, teamId NULLABLE,
  requiredCount)` — the demand side.
- `assignment` — `(shiftId, volunteerId, roleId)` — role is recorded at
  assignment time.
- `ServingProfileHeadcount` — `{ roleId, teamId?, count }`. NOTE:
  `MinistryServingProfile` is a **ministry-level template** (which time blocks
  the ministry serves, shift splits, headcounts). It has NO volunteerId and is
  NOT a volunteer→role mapping. Do not mistake it for one.

Two findings that shape the work:

1. **The rule already exists in the domain.**
   `ConflictValidationService.validateHardConstraints`
   (`apps/server/src/domain/conflict/conflict-validation-service.ts`) accepts
   `volunteerQualifiedRoleIds` and throws
   `HardConstraintError('NOT_QUALIFIED')`. Only the storage and the supplier are
   missing. This is wiring, not a new concept.

2. **Two assignment paths, different rules.**
   - `apps/server/src/domain/assignment/assignment-manager-service.ts:288` calls
     `validateHardConstraints` (enforces NOT_QUALIFIED).
   - `apps/server/src/application/db-assignment-manager.ts`
     `createParticipationAssignment` — **the cycle-builder path used by 023** —
     never calls it. It checks availability + overlap only, and at line ~312
     `enforcementType === 'hard'` blocks **only** `DUPLICATE_ASSIGNMENT`, and
     only when `input.override?.reason` is absent.

3. **`listQualifiedForRole` is a no-op filter** (latent bug).
   `apps/server/src/infrastructure/repositories/drizzle-volunteer.repository.ts:154`
   joins `role` on `role.id = roleId AND role.ministryId = ministryId` with **no
   predicate tying the role to the volunteer**. It returns every active
   non-leader ministry member regardless of role. It also excludes leaders via
   `ne(ministryVolunteer.systemRole, 'leader')`.

## Decisions made (locked)

1. **Qualification granularity: role only; team stays a separate axis.**
   Qualification = `(membership, role)`. Eligibility composes at query time:
   qualified for the role **AND** (`requirement.teamId IS NULL` OR the volunteer
   belongs to that team). This mirrors how `slot_requirement` already keeps
   roleId and teamId as independent columns. No `(role, team)` rows.

2. **Multi-team: flat many-to-many, no primary team.**
   New `ministry_volunteer_team (membershipId, teamId)`. Backfill from the
   existing `ministry_volunteer.teamId`, then drop the column. Nothing in the
   codebase currently needs a "primary" team.

3. **Enforcement mirrors the existing overlap rule.**
   `hard` = block the assignment unless an override reason is supplied;
   `soft` = warning only. This reuses the exact pattern
   `db-assignment-manager` already applies to `DUPLICATE_ASSIGNMENT`, so
   `enforcementType` finally means one consistent thing across constraints.

4. **No data migration/backfill of qualifications.**
   The user confirmed there is **no real production data yet** — the database is
   filled by seed scripts for screen testing. So: do **not** write a
   backfill migration guessing qualifications from assignment history. Instead
   **update the seed files and re-run them** so seeded volunteers get sensible
   role qualifications and multi-team memberships.
   Seeds: `apps/server/src/scripts/seed-dev-users.ts`,
   `apps/server/src/test-support/e2e-seed.ts`.

## Proposed table (starting point, not yet stress-tested)

```
ministry_volunteer_role
  id, churchId
  ministryVolunteerId  -> ministry_volunteer.id (cascade)
  roleId               -> role.id (cascade)
  unique(ministryVolunteerId, roleId)
```

Hung off the **membership**, not the volunteer, because roles are
ministry-scoped and one person can serve several ministries.

## Resolved (2026-07-22) — previously open, now locked

5. **Leaders and sub_leaders are qualifiable and assignable.**
   Drop `ne(ministryVolunteer.systemRole, 'leader')` from the candidate pool.
   `systemRole` means permissions (who may edit the cycle), not availability to
   serve. Qualification becomes the only pool predicate.

6. **Global roles are qualifiable, scoped per membership.**
   A `ministry_volunteer_role` row may point at a role with `isGlobal = true` /
   `ministryId = NULL`. Because the row hangs off one membership, qualifying Ana
   for a global role in Kids does **not** qualify her in Worship. No extra table,
   no cross-ministry leak, consistent with church/ministry isolation.

7. **Both assignment paths enforce NOT_QUALIFIED.**
   - `db-assignment-manager.createParticipationAssignment` (023 builder) gets the
     check wired in, following the existing `DUPLICATE_ASSIGNMENT` pattern
     (`hard` blocks unless `input.override?.reason`; `soft` warns).
   - `assignment-manager-service` keeps its existing
     `validateHardConstraints` call but is finally fed a **real**
     `volunteerQualifiedRoleIds` supplier instead of an empty list.

8. **Admin UI: ministry members screen, per-volunteer editor.**
   Roles and teams are edited on the member row where the person already lives:
   a multi-select of ministry roles plus a multi-select of teams. No bulk
   role-to-many screen in this scope.

9. **Fix `listQualifiedForRole` inside this work, not as a follow-up.**
   Rewrite the join to go through `ministry_volunteer_role` (real
   volunteer↔role predicate) and drop the leader exclusion per decision 5. The
   method's entire purpose is what this feature adds; splitting it would ship a
   knowingly-wrong query twice.

10. **API shape: embed the ids on the volunteer option.**
    `ScheduleBuilderVolunteerOption` gains `qualifiedRoleIds: string[]` and
    `teamIds: string[]` (the latter for the multi-team change). One payload, the
    client filters candidates locally, no extra round-trip. Route schema changes
    first, then `apps/web/src/infrastructure/api/churchAPI.schemas` regenerates.

## Rules for this work

`agents.local.md` applies in full — this is real code, not a prototype:

- Single-object parameters; every object shape gets a named `interface`/`type`;
  no inline object typing in touched files.
- No linter/compiler suppression directives without explicit permission.
- Backend: DDD + Clean Architecture, strict `church_id` multi-tenant isolation.
- Phase-by-phase loop. After each phase: `bun run check`, `bun run check-types`,
  `bun run test`, `bun run test:e2e`, then a code review of modified files. Fix
  everything found before moving on.
- Commits: Conventional Commits, **no Co-Authored-By trailer**.

## Suggested next step

The six open questions are answered (see "Resolved" above). Next:
`speckit-specify` → `speckit-plan` → `speckit-tasks`. This is genuinely new
scope, not 023 cleanup.
