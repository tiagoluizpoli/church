# Tailoring Workspace (022) — Code Review — 2026-07-14

Scope: every change on `022-tailoring-workspace` not yet on `master` (the branch's full commit history) plus the current uncommitted working tree — practically, this is dominated by Iteration 3 (cycle-list status/batch-endpoint/filters/nav, `apps/server`+`packages/db`+`apps/web`) since Iterations 1–2 were already reviewed and merged into prior commits on this branch. Reviewed against `specs/022-tailoring-workspace/{spec,plan,tasks,data-model,research}.md`.

## 0. Executive Summary

High quality. Backend (first backend surface in this feature) is correct and well-tested: church isolation verified with a real two-church integration test, join-fanout avoided via a deliberate two-query-plus-in-memory-aggregate design, the `eventCount === 0` vacuous-truth bug is explicitly guarded against and tested. All 9 new/amended FRs (FR-028–FR-036) trace to working, tested code. 718/718 server tests pass; 405/406 web tests pass (the one failure is pre-existing flakiness in an unrelated file, confirmed by rerunning it in isolation — not a regression from this branch). Typecheck is clean across all 7 packages.

One **blocking** issue: three files central to this iteration (`cycle-list-filters-bar.tsx`, `cycle-list.utils.ts`, `cycle-list.utils.unit.test.ts`) are untracked (`git status` shows `??`, not `M`) — they exist on disk and pass tests locally, but are not staged. A commit right now would ship `ministry-cycle-list.tsx` importing from a file (`cycle-list.utils.ts`) that isn't in git history, breaking the build for anyone else who pulls. Everything else below is advisory.

## 1. Spec Alignment

All Iteration 3 functional requirements verified against implementation, not just tasks.md checkmarks:

| FR | Check | Evidence |
|---|---|---|
| FR-028 (real name/date span, not event title) | PASS | `cycle-list.utils.ts` `buildMinistryCycleSummaries` sources `name`/`startDate`/`endDate` from the new endpoint |
| FR-029 (event/slot counts, 0 for not-part-of) | PASS | `drizzle-ministry-participation.repository.ts` two-query aggregate; repo test asserts `eventCount: 0, slotCount: 0` for `isPartOf: false` |
| FR-030 (status rule, never `PlanningCycle.state`) | PASS | `aggregateCycleTailoringStatus` in `ministry-participation.ts` domain entity; `cycle-list.utils.ts` never reads `PlanningCycle.state` |
| FR-031 (`touchedAt` set once) | PASS | `MinistryParticipation.touch()` guarded by `if (this._props.touchedAt !== null) return`; repo `touch()` guarded by `isNull(...)` in the `WHERE`; both covered by dedicated tests |
| FR-032 (one batched request, includes name/date-span) | PASS | Single `listMinistryCycleSummaries` call is the route's sole data source (old `listEvents`/`listPlanningCycles` calls removed); `T072a`-style call-count assertion exists |
| FR-033 (3 filters, AND semantics, real "not part of" data) | PASS | `filterCycleSummaries` combines all three with early-return AND; backend query starts from all locked cycles then LEFT-joins ministry data, so `isPartOf: false` rows are real, not synthesized client-side |
| FR-034 (header pills reflect filtered set) | PASS | `eventTotal`/`slotTotal` in `$ministryId/index.tsx` are `useMemo`'d off `filteredCycles`, not `allCycles` |
| FR-035 (Builder Events disabled correctly, never vacuously enabled) | PASS | `eventCount === 0` special-cased to `availabilityFiredForAll: false` explicitly in `aggregateCycleTailoringStatus`, exactly the bug research.md R16 calls out |
| FR-036 (shared padding token) | PASS | `MinistryCycleList` uses `workspace-panel-lg` via a plain `div` (with a documented comment explaining why not `CardContent`, whose `@layer utilities` padding would win the cascade) |

No spec/plan drift found. The plan's documented deviations (component-level tests instead of live-DB/Playwright for US4, `useEffect`+`navigate` instead of `beforeLoad` redirect) are consistently applied and match their own justification notes.

## 2. Deprecated Code Found

None. No React legacy APIs, no Tailwind v3 classes, no callback-style Node APIs in any changed file.

## 3. Architecture Issues

**WARNING** — `apps/web/src/features/scheduling/components/tailoring/tailoring-slot-list.tsx` (772 lines) and `apps/web/src/routes/scheduling/tailoring/$ministryId/$cycleId.tsx` (731 lines) exceed the repo's 300-line God File guideline. In `tailoring-slot-list.tsx`, `SlotRow` (~365 lines) renders the inclusion toggle, the split-save panel, and the entire headcount-shift loop (with its own loading/error/empty role-catalog states) in one function. Not urgent — each concern is still legible and the file is exhaustively tested (18 tests) — but `SplitPanel`/`HeadcountPanel` would be natural extraction points if this file grows further.

**WARNING** — `$cycleId.tsx` has 9 `useState` calls in `TailoringWorkspaceRoute`, 5 of which (`splitForms`, `headcountDrafts`, `savedSplitForms`, `savedHeadcountDrafts`, `touchedParticipationIds`) change together as part of the same save/dirty-tracking lifecycle per the architecture-review checklist's "multiple related `useState` → `useReducer`" rule. Consider consolidating these five into one reducer or a `useTailoringEditSession`-style custom hook. Not blocking — each setter is narrowly scoped and the route's tests (`T045b`/`T046`/`T047`/`T048a`, added in a prior review pass per tasks.md) already pin the exact behavior this refactor would need to preserve.

**INFO** — `useMediaQuery('(max-width: 767px)')` is called independently in `TailoringSlotList` (once) **and** again in every `SlotRow` instance, and separately again in every `CycleRowActions` instance in `ministry-cycle-list.tsx`. `TailoringSlotList` already computes `isMobile` and could pass it down as a prop instead of letting each row re-subscribe its own `matchMedia` listener. Cheap to fix, low urgency (listeners are inexpensive, lists here are small).

## 4. Security Issues

None found. RBAC (`canManageMinistry`) guards the new `/ministries/:ministryId/cycles-summary` route the same way `getCycleParticipation` is guarded, with a passing 403 test and a passing "not called on 403" assertion. Church isolation is applied on every table touched by the new aggregation query (`planningCycle`, `ministryParticipation`, `event`, `participationSlotInclusion`) and is the subject of a dedicated two-church integration test that asserts zero cross-church rows leak. No secrets, no raw SQL, no unvalidated input reaching a query.

## 5. Performance Issues

- The new repository query avoids the two obvious traps: it doesn't do N+1 (one call for cycles, one for participations, one for slot counts — three total regardless of row count) and it deliberately avoids join-fanout by computing slot counts in a separate grouped query rather than joining `participationSlotInclusion` directly onto the participation join (the code comment explains why). Good.
- See Architecture §3's `useMediaQuery` note — the only performance nit found, and it's minor.

## 6. Code Quality

- No duplicated logic found between the Iteration 3 cycle-list filter/status helpers and the Iteration 2 slot-list filter helpers — they're structurally similar (predicate composition with AND semantics) but operate on different shapes and don't share enough to warrant a shared abstraction yet.
- Named object parameters are used consistently everywhere, including single-argument functions (`aggregateCycleTailoringStatus`, `compareCycles`, `isDateWithinRange`), matching the constitution's Explicit Parameter Contracts rule.
- `biome-ignore` comments (3 total, all `useNamingConvention` for API enum values like `not_started`) are justified and narrowly scoped.
- No `any`, no unexplained `as` casts, no un-commented non-null assertions in any changed source file.

## 7. Type Safety

Clean. `bun run check-types` passes across all 7 packages (`@church/auth`, `@church/config`, `@church/core`, `@church/db`, `@church/env`, `server`, `web`) with zero errors. The new DTO (`ministryCycleSummaryResponseSchema`) is a proper Zod schema feeding a typed mapper function, not a hand-cast response.

## 8. Test Coverage

Exceptional. 718/718 server tests pass (includes the new domain unit test for `touch()`/`aggregateCycleTailoringStatus`, a repository test suite covering all three status buckets plus the `isPartOf: false` vacuous-truth trap, a live-Postgres two-church isolation test, and controller 200/403 tests). 405/406 web tests pass — the single failure (`ministry-schedule-section.component.test.tsx`, unrelated to this feature) reproduces only under full-suite parallel load and passes cleanly in isolation; this matches a known flakiness pattern already acknowledged in this branch's own commit history ("increase component test timeouts to handle heavy parallel CI load").

## 9. Supplemental Smell Scan (Mysterious Name / Message Chains / Middle Man / Refused Bequest / Speculative Generality / Divergent Change)

Run separately after a skill-version update added these named smells to Dimension 6's checklist. Targeted grep passes plus manual inspection of every candidate across all 32 changed non-test source files:

- **Message Chains**: grep for 4+-hop property/method chains found only typed DTO field reads (`cycleQuery.data.cycle.startDate`, `visibleRow.row.title`) — normal TanStack Query/typed-response usage, not objects reaching through unrelated intermediaries. No finding.
- **Mysterious Name**: grep for 1–2 character identifiers found only conventional short names in tight scope (`db` for a Drizzle client, `id`/`to` in one-line route/breadcrumb helpers, `i` in test-file `for` loops). No finding.
- **Middle Man**: every short (≤4-line) function in the diff was inspected; each contains real logic (regex validation, arithmetic, date parsing, string building) rather than an unmodified pass-through to another function. No finding.
- **Speculative Generality**: grep for exported symbols with zero references outside their declaring file flagged ~15 candidates; every one resolves at its own declaration site (return-type annotation, param-type annotation) per this repo's Explicit Parameter Contracts convention — exported because the constitution requires named types above usage, not because of a speculative future need. No finding.
- **Divergent Change**: the one changed file outside the feature's own directories (`calendar-row.tsx`) was touched for exactly one reason — folding displayed row data into the Collection's memoization key, a pre-existing gotcha already tracked in this project's memory. No finding.
- **Refused Bequest**: not applicable — no class inheritance anywhere in this diff.

No new findings from the expanded checklist; the report's conclusions and action items above are unchanged.

## Action Items — all resolved 2026-07-14

### BLOCKING (must fix before merge/commit)
- [x] Staged the 3 untracked files (`cycle-list-filters-bar.tsx`, `cycle-list.utils.ts`, `cycle-list.utils.unit.test.ts`) — `git add` run; confirmed no longer showing as `??`.

### HIGH (fix this sprint)
- (none)

### BACKLOG (track and schedule)
- [x] Extracted `SplitPanel`/`HeadcountPanel` sub-components out of `SlotRow` in `tailoring-slot-list.tsx` — `SlotRow` now only owns the row shell/collapsible/header; each panel owns its own save button and (for headcounts) its own derived-state computation. 22/22 component tests still pass unmodified (same `data-testid`s preserved).
- [x] Consolidated `$cycleId.tsx`'s 5 save/dirty-tracking `useState` calls (`splitForms`, `savedSplitForms`, `headcountDrafts`, `savedHeadcountDrafts`, `touchedParticipationIds`) into one `useReducer` (`editSessionReducer`) with 7 explicit action types. `selectedDate`/`confirmSendOpen`/`nameQuery`/`timeWindowFilter` deliberately stayed as independent `useState` — genuinely unrelated UI state, not part of the edit-session lifecycle. 18/18 route tests still pass unmodified.
- [x] Replaced per-row/per-instance `useMediaQuery` calls with the existing `useFormControlSize()` context (already wired via `FormControlSizeProvider` in both `tailoring-slot-list.tsx` and now `ministry-cycle-list.tsx`) in `SlotRow`, `HeadcountPanel`, `ManualSplitEditor`, `CycleRowActions`, and `CycleListFiltersBar` — 5 redundant `matchMedia` subscriptions collapsed down to 2 root sources (one per component tree).
- [x] Added `!!**/.impeccable` to `biome.json`'s `files.includes` — `bun run lint`/`bunx biome check .` now exits clean instead of always failing on the gitignored cache file.

**Post-fix verification**: `bunx biome check .` clean (0 errors), `bunx tsc --noEmit` clean across the web package, 406/406 web tests pass (including the previously-flaky `ministry-schedule-section.component.test.tsx`, confirming it was flakiness, not a regression), 718/718 server tests pass.
