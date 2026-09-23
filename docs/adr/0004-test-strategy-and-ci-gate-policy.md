# Test Strategy and CI Gate Policy

## Status

accepted

## Context

The full Playwright suite is expensive to run routinely and, before #121, is
not reliably green. Contributors and agents had no single seam for deriving
which browser journeys a change actually affects, so coverage decisions were
inconsistent: some changes grew new E2E specs for isolated behavior, others
skipped a journey they should have run, and CI did not reflect the intended
branch flow (task branches merge into `develop` frequently; `develop` merges
into `master`, the production branch, only when release-ready).

[#210](https://github.com/tiagoluizpoli/church/issues/210) ("Spec: Pragmatic
test strategy and CI gate policy") is the map issue that chartered this
decision and split it into implementation seams
([#211](https://github.com/tiagoluizpoli/church/issues/211)–[#222](https://github.com/tiagoluizpoli/church/issues/222)).
This ADR records the trade-offs those seams converged on.

## Decision

### One test-selection seam

`tooling/validation/affected.ts` (`bun run validate:affected`) is the single
policy seam for test selection, both locally and in CI. It:

- Maps a changed workspace to the lowest test layer that can prove it
  (`test:unit`, `test:integration`), using Turbo's dependency graph so a
  change to a shared package (`@church/time`, `@church/db`, …) also re-runs
  its dependents.
- Derives affected critical browser journeys from touched production web/server
  source via a typed, version-controlled map
  (`tooling/validation/journey-map.ts`'s `JOURNEY_MAP`), instead of requiring a
  contributor to remember which E2E spec covers what.
- Falls back to `CRITICAL_SMOKE_SPEC_PATHS` (identity redemption, active-Church
  isolation, planning builder, Availability, roster publishing) whenever a
  production change has no `JOURNEY_MAP` entry, and reports the path as a
  missing mapping — so absent metadata degrades to "run the critical smoke
  set," never to silently running nothing.
- Escalates to the full E2E suite only when shared E2E infrastructure itself
  changes (`playwright.config.ts`, global setup/teardown, the E2E seed) — and
  only outside the daily gate (see below); the daily gate never escalates to
  the full suite, so a Playwright-infrastructure change on a task branch still
  gets its normal mapped/critical-journey run.

### Playwright is critical-journey-only

A critical journey proves a user-visible outcome across at least two of
browser, API, database, authentication, or real-time delivery. Deterministic
domain/utility rules, isolated component interaction, layout, and
accessibility state stay below Playwright unless they are necessary within a
retained journey (the one exception being axe-core WCAG scans, which need real
browser paint). #213–#219 classified every existing spec against this
criterion; specs that didn't qualify were deleted and their coverage moved to
unit/component tests, not merely disabled.

### Naming boundary

Playwright discovers only `*.spec.ts` files under `apps/web/tests/`. Vitest
owns `*.test.ts(x)`, including component tests. Helper files use neither
suffix. This boundary is mechanically regression-tested (#211) by asserting
Playwright's own discovery list contains only spec files, so a misnamed
Vitest file can never silently execute as (or be skipped as) an E2E test.

### Two CI gates, not one

- **Daily gate** — every task-branch → `develop` pull request. Requires the
  fast gate (typecheck, lint, `test:unit`, `test:integration`) plus
  `validate:affected --daily-gate`. Targets a 10-minute elapsed ceiling
  (enforced via each job's `timeout-minutes: 10` and measured in the job
  summary). Never runs the full E2E suite.
- **Release gate** — `develop` → `master` pull requests. Requires complete
  validation (`bun run validate`), including the full E2E suite, plus a
  post-merge safety rerun on `master` push. This gate is deliberately deferred:
  it activates only once [#121](https://github.com/tiagoluizpoli/church/issues/121)
  has demonstrated a repeatedly green full suite, and its branch-protection
  wiring is [#222](https://github.com/tiagoluizpoli/church/issues/222)'s to
  build. Until then, `master` gets the fast gate on push plus a post-merge E2E
  run as a safety net, not yet a required PR check.

Both `develop` and `master` reject direct pushes and require their respective
checks once configured; a routine bypass is forbidden, and an emergency bypass
is explicit and followed by a repair pull request.

### Failure handling

A failing E2E spec gets exactly one automatic retry with its trace retained.
A second failure blocks the merge and starts triage standalone-first: is it a
product defect, a test defect, fixture isolation, or order dependence? Fixing
the cause (fixture isolation, deterministic ordering) is preferred over
raising the retry count or disabling the spec.

### Ownership

Every behavior change is owned by its feature contributor, who maintains the
lowest valid test layer and any affected critical journey. There is no
separate QA role or gatekeeping reviewer for test coverage; the daily gate and
the journey map are what make that ownership tractable without a human
remembering every mapping by hand.

## Consequences

- Contributors and agents get one command (`bun run validate:affected`) that
  answers "what do I need to run for this change," locally and in CI, instead
  of guessing.
- A `JOURNEY_MAP` entry is a claim that must stay in sync with real route/spec
  coupling; under-mapping is safe (it only widens the fallback to the critical
  smoke set) so entries are added only once verified against a real spec, but
  over-mapping (an entry outliving the spec it points to) is a live drift risk
  the map's maintainers should watch for.
- Full-suite E2E runs stay rare (full-infrastructure changes and the deferred
  release gate) rather than routine, which keeps the ~5-minute daily budget
  intact but means a `develop` → `master` promotion is the first point some
  regressions are ever caught — acceptable only because #121 gates when that
  promotion gate turns on.
- The release gate's activation is a dependency on #121, not a substitute for
  it: this policy does not itself make the full suite green, it only decides
  when to start requiring that it be.
- New Playwright specs require both the critical-journey criterion and a
  `JOURNEY_MAP` entry pointing at them, keeping the E2E budget an intentional
  decision rather than an accreting one.
