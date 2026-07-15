# Quickstart: Event Builder (Cycle-Centric)

**Feature**: `023-event-builder` | **Date**: 2026-07-14

How to build, run, and verify this feature. Read alongside `plan.md`, `research.md`, `data-model.md`, and `contracts/`.

## Prerequisites

- Monorepo bootstrapped (`bun install`), Docker Compose up (Postgres) per constitution III.
- Familiar with the leader flow: ministry → cycle → **tailoring** (`022`) → availability fires → **builder** (this feature) → publish.
- Approved layout prototype for reference: `…/scheduling/rostering/prototype?variant=G`.

## Build order (follows R3 cutover: backend → new route additively → repoint → migrate e2e → delete legacy)

1. **Backend read** — `getCycleBuilderData` endpoint (`contracts/` §1), manager + repository Query A/B, DTO. Integration tests incl. two-church isolation (R8). Regenerate orval client.
2. **Backend publish** — `publishCycle` endpoint (§3), batched transactional manager method reusing existing publish rule. Integration tests incl. below-full path + isolation.
3. **Backend audit** — `getCycleAuditLog` endpoint (§2), `listAuditLogForCycle` manager + `listByCycle` repo method. Integration tests + isolation.
4. **Derived field** — `availabilityFiredForAny` down the chain (data-model §"Derived field addition"). Regenerate orval client.
5. **New route (additive)** — `/scheduling/rostering/$ministryId/$cycleId` builder canvas: rebuild the 10 grid-structural components for the cycle board (R2/R3), reuse the 7 presentational as-is, rewire the 3 pool-dependent + `audit-log-panel`.
6. **Recommendations** — shift/role ranking + Needs-response/Conflict grouping + Accept (R4), on already-fetched builder data, with post-mutation/focus/~30s revalidation.
7. **Repoint entry** — `ministry-cycle-list.tsx`: **Assign** button, gate on `availabilityFiredForAny`, new copy + testids (R6). Repoint the other 3 entry points off `/scheduling/builder-events`.
8. **Migrate e2e** — the 5 legacy builder specs to the new route/testids.
9. **Delete legacy** — 3 legacy routes, the 4 slot-management `builder/` files, `mobile-interstitial.tsx`.

## Verify (constitution Quality Gates — run per phase, per `agents.local.md`)

```bash
bun run check         # Biome lint + format
bun run check-types   # tsc — zero errors, no any/unknown
bun run test          # Vitest unit/integration (incl. two-church isolation tests, R8)
bun run test:e2e      # Playwright — migrated builder specs green
```

Then run `/review` (or `code-review` skill) on the modified files before declaring a phase complete.

## Manual smoke (per user story)

- **US1**: open builder for a ministry+cycle with availability fired; confirm one canvas shows every event/slot/shift with staffing progress; assign, reassign (swap vs assign-both), remove; reload — draft persists.
- **US2**: leave a shift below full → Publish → below-full confirmation → confirm → every participation `published` in one action; reopen and reassign one volunteer (still allowed).
- **US3**: open a shift's recommendations → ≤5 ranked, top highlighted with Accept; pending under "Needs response"; unavailable/overlap under "Conflict options" requiring override reason.
- **US4**: cycle row with ≥1 availability fired → **Assign** enabled → lands in builder; row with none fired → disabled, "Unlocks once availability has fired for this cycle"; old "Builder Events" entry + per-event route gone.
- **US5**: make/override several assignments → open audit panel → single cycle-wide list with actor/action/timestamp/reason + volunteer name (joined client-side), lazy-loaded.
- **US6**: narrow viewport → full canvas usable (view/assign/publish), board scrolls horizontally, volunteer rail stacks below — no interstitial.

## Key references

- Endpoint decisions: [#2](https://github.com/tiagoluizpoli/church/issues/2) (read), [#7](https://github.com/tiagoluizpoli/church/issues/7) (audit); layout [#4](https://github.com/tiagoluizpoli/church/issues/4); ranking [#6](https://github.com/tiagoluizpoli/church/issues/6); retirement [#5](https://github.com/tiagoluizpoli/church/issues/5) + asset `manual-planning/0001-volunteer-scheduling/research/legacy-builder-retirement-inventory.md`; entry/gating [#8](https://github.com/tiagoluizpoli/church/issues/8).
- Backend rules: `manual-planning/0001-volunteer-scheduling/specifications/R2-drizzle-repos.md`; precedent `specs/022-tailoring-workspace/plan.md` (Iteration 3 backend re-check).
