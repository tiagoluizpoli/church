# 023 Spec Drift Log — qualification + multi-team

Running list of divergences between the implementation and
`specs/023-event-builder`. **Do not edit the spec while implementing.** When the
assigning page reaches the target state, review this list and add targeted
amendments on top of the existing 023 spec files — only where necessary.

## Phase 1 — schema

1. **`ministry_volunteer.team_id` not dropped in the same migration as the new
   tables.** Handoff decision 2 says "backfill from the existing
   `ministry_volunteer.teamId`, then drop the column". Dropping it in migration
   0010 would break every reader (the `MinistryVolunteer` entity, the volunteer
   repository contract, volunteer DTOs, both seed files) and fail the phase-1
   `bun run check-types` gate. The column drops in **phase 2**, together with the
   readers that move to `ministry_volunteer_team`. Same end state, one phase later.

2. **No data backfill from `ministry_volunteer.team_id`.** Confirmed with the
   user: migration 0010 stays purely drizzle-kit-generated DDL. Team memberships
   come from the seed files (phase 5), consistent with decision 4 (no production
   data exists).

3. **`ministry_volunteer_team` carries `id`, `church_id` and `created_at`.** The
   handoff sketched it as `(membershipId, teamId)`. The extra columns match every
   other table in `packages/db/src/schema/core.ts` and satisfy the strict
   `church_id` multi-tenant isolation rule in `agents.local.md`.
