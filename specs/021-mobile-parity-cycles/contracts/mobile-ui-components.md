# Contracts: Mobile UI Components

This feature adds no backend routes and no new API surface — it is a frontend
presentation/interaction feature reusing spec 020's mutation endpoints unchanged
(`createPlanningEvent`, `updatePlanningEvent`, `cancelPlanningEvent`,
`updatePlanningEventSlot`/`createPlanningEventSlot`/`deletePlanningEventSlot`, all already
wired to `adminApi` via orval). The only "contracts" this feature introduces are frontend
component prop contracts, documented in `data-model.md` under New Component Contracts:

- `ResponsiveFormSurfaceProps` — desktop-`Dialog`/mobile-`Drawer` swap shell, built on the
  standard shadcn `drawer` component (installed fresh, not a generalization of the pre-existing
  bespoke nav drawer — see research.md R1).

No `contracts/*.md` route-contract files are needed for this feature.
