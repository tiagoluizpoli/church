# Phase 0 Research: Planning Cycles Table View

## R1: Intent UI Table component — install path and expandable-row API

**Decision**: Install via `npx shadcn@latest add @intentui/table` run from `apps/web` (this repo's shadcn root, per `apps/web/components.json`). Do not attempt to pre-guess the expandable-row prop API from documentation — Intent UI's docs site renders its code examples client-side (confirmed via fetch: the "Expandable rows" example section returns `Loading...` to a static fetch, no server-rendered code). Once installed, read the generated component source under `apps/web/src/components/ui/table.tsx` (or wherever the CLI places it) directly to learn the real props/pattern before wiring it into `cycle-review-card.tsx`.

**Rationale**: This repo's own shadcn convention (`apps/web/components.json`, `style: base-lyra`) already diverges from vanilla shadcn/ui in prior installs (`bunx shadcn@latest add tabs`/`breadcrumb` in spec 018 needed a `biome check --write` pass after generation to match repo formatting, and used `@base-ui/react` primitives instead of Radix) — treating the installed source as ground truth, not the public docs, avoids building against an API that may not match what the CLI actually emits for this project's configured style.

**Alternatives considered**: Hand-rolling expand/collapse state over the existing shadcn/ui-style flat table (no such table primitive exists in this repo yet — `apps/web/src/components/ui/` has no `table.tsx` today, confirmed via directory listing) — rejected because `manual-planning/0001-volunteer-scheduling/specifications-list.md`'s Mandatory Frontend Rule ("Strict shadcn/ui Adherence") explicitly requires stopping and sourcing a community implementation rather than hand-building a missing primitive, which is exactly Intent UI's role here per direct user instruction.

## R2: Registry configuration

**Decision**: `apps/web/components.json`'s `registries` field is currently `{}` (confirmed). The `@intentui/table` CLI invocation is expected to either resolve via a shadcn-ecosystem-wide registry alias (no local config needed) or prompt/require a registry entry to be added to `components.json`. Resolve this empirically at implementation time by running the install command and observing whether it succeeds unmodified or requires a `registries` entry first (Intent UI's own docs reference a registry URL pattern typical of shadcn community registries, e.g. `https://intentui.com/r/{component}.json`).

**Rationale**: Avoids committing to a registry URL that may be stale or wrong without having actually run the install.

**Alternatives considered**: Manually vendoring Intent UI's table source by copy-paste — rejected; the whole point of the CLI-registry flow is to keep the component's dependency graph (react-aria-components, etc.) and future updates manageable, consistent with how `tabs`/`breadcrumb` were installed in spec 018.

## R3: Peer dependencies

**Decision**: Intent UI's table component depends on `react-aria-components` (React Aria) rather than the Radix primitives this repo's other shadcn components use in places, and this repo's shadcn `style` is already `base-lyra` (a `@base-ui/react`-based style per spec 018's T034 finding, not pure Radix either) — so a third distinct primitive library (`react-aria-components`) is not unprecedented in this codebase's shadcn usage, which already mixes primitive sources across installed components. Add `react-aria-components` (and any other peer the CLI reports as missing, e.g. `tailwind-merge` — already present in this repo's `apps/web/package.json`) as a new direct dependency of `apps/web` if the CLI does not install it automatically.

**Rationale**: Confirmed via Intent UI's own docs that `react-aria-components` and `tailwind-merge` are the component's peer dependencies; `tailwind-merge` is already a dependency of `apps/web` (confirmed in `apps/web/package.json`), so only `react-aria-components` is a net-new package.

**Alternatives considered**: N/A — this is a fixed constraint of the chosen component, not a design choice.

## R4: Desktop/mobile breakpoint convention

**Decision**: Reuse this repo's existing `md:` (768px) breakpoint, the same one `app-shell.tsx` already uses to switch between its desktop sidebar and mobile bottom nav/top header (`md:hidden` on the mobile-only header/nav elements, confirmed at `apps/web/src/components/app-shell.tsx:261` and `:598`). The table renders at `md:` and above; below it, the existing card/list markup renders unchanged.

**Rationale**: `spec.md`'s Assumptions section deliberately left the exact breakpoint open ("reuses whatever breakpoint convention the app already applies") rather than inventing a new one — this is that convention, confirmed by direct inspection rather than assumed.

**Alternatives considered**: A new `lg:` (1024px) breakpoint, floated informally earlier in this feature's initial framing — rejected in favor of reusing the app's one existing, already-tested desktop/mobile boundary rather than introducing a second, inconsistent one.

## R5: Existing data shapes for the three tables

**Decision**: No new API calls or data reshaping needed — all three screens already fetch exactly the data the tables need, via the same context hooks spec 018 established:

- Planning cycles index: `useCycleListCard()` → `cycles: PlanningCycleSummary[]` (`ListPlanningCycles200CyclesItem` — `id`, `name`, `startDate`, `endDate`, `state`), rendered today in `cycle-list-card.tsx`.
- Template library: `useTemplateManagerCard()` → `templates: PlanningTemplateSummary[]` (`ListEventTemplates200TemplatesItem`), rendered today in `template-manager-card.tsx`.
- Selected cycle review: `useCycleReviewCard()` → `cycleEvents: PlanningCycleEventGroup[]` (`GetPlanningCycle200EventsItem` — each item is `{ event: {..., title, startDate, endDate, eventType, status}, slots: [{id, label, startTime, endTime}] }`), rendered today in `planning-event-card.tsx`. This is the exact parent/child shape the expandable-row table needs: one table row per `eventGroup` (weekday/date entry), expanding to one child row per `eventGroup.slots[]` entry.

**Rationale**: Confirmed by reading `planning-admin.types.ts`, `cycle-list-card.tsx`, `template-manager-card.tsx`, `cycle-review-card.tsx`, and `planning-event-card.tsx` directly — this feature is presentation-only, no data-layer change required, consistent with `spec.md`'s Key Entities note.

**Alternatives considered**: N/A.

## R6: Component boundary — replace vs. add alongside

**Decision**: Each of the 3 existing card components (`cycle-list-card.tsx`, `template-manager-card.tsx`, `cycle-review-card.tsx`) gets a sibling table-rendering path selected by the `md:` breakpoint, inside the same component (conditional render: `<div className="md:hidden">{existing card markup}</div><div className="hidden md:block">{new table markup}</div>`), rather than new separate route-level components. This keeps each screen's single data-fetching hook (`useCycleListCard`/`useTemplateManagerCard`/`useCycleReviewCard`) as the one source of truth for both layouts, avoiding duplicated queries.

**Rationale**: Matches this repo's existing responsive pattern in `app-shell.tsx` (one component, two conditionally-rendered subtrees gated by `md:hidden`/`hidden md:block`) rather than inventing a new one.

**Alternatives considered**: Fully separate `*-table.tsx` components per screen, selected by a parent — rejected as unnecessary indirection for a same-data, same-hook, breakpoint-only presentational split; would also require duplicating the empty/loading state branching already in each card component.
