# Church Tooling

Bun and Node versions are pinned in `mise.toml` (`mise install`); `packageManager`
in `package.json` must name the same Bun (`bun run validate:bun-version`, part of
`lint` and `validate:affected`).

Run commands from the repository root through existing Bun scripts. Do not
invoke package tools directly: root scripts carry required environment, filters,
and task ordering.

| Intent | Command |
| --- | --- |
| Lint + format | `bun run lint:fix` |
| Lint (read-only: reports, never fixes) | `bun run lint` |
| Typecheck | `bun run typecheck` |
| Unit/component tests | `bun run test:unit` |
| Integration tests | `bun run test:integration` |
| Story E2E | `bun run test:e2e -- tests/[path].spec.ts` |
| Complete test suite | `bun run test` |
| Seed contracts (every recipe, refusals) | `bun run test:seeds` |
| Test placement guard | `bun run validate:test-placement` |
| Named-parameter guard (constitution VII) | `bun run validate:named-parameters` |
| Bun pin guard (`mise.toml` = `packageManager`) | `bun run validate:bun-version` |
| Presentation-text guard (no hard-coded copy) | `bun run validate:presentation-text` (`-- <path>…` for files) |
| Server types guard (no types in implementation files) | `bun run validate:server-types` (`-- <path>…` for files) |
| List-order guard (list queries end in `ORDER BY`) | `bun run validate:list-order` (`-- <path>…` for files) |
| Generated API guard (CI-only: rewrites the tree) | `bun run validate:api-generated` |
| Journey-map integrity guard | `bun run validate:journey-map` |
| E2E lane-list guard (no Playwright start) | `bun run validate:e2e-lanes` |
| Constitution version guard (amendments bump version) | `bun run validate:constitution-version` |
| Sign-in load times and filmstrip ([harness](#sign-in-load-harness)) | `bun run perf:sign-in` |
| Web bundle gzip budget (needs a built `apps/web/dist`) | `bun run validate:bundle-budget` |
| `/login` module requests under `vite dev` ([cap](#dev-module-cap)) | `bun run validate:dev-module-cap` |
| Affected validation without Docker (pre-push) | `bun run validate:no-docker` |
| Affected validation | `bun run validate:affected` |
| Final validation | `bun run validate` |
| Rebuild + seed this worktree's development DB | `bun run db:reseed:dev` (`-- --anchor=YYYY-MM-DD` to reproduce a day) |
| SQL on this worktree's development DB (Docker, no host `psql`) | `bun run db:sql -- -c 'select 1'` (psql arguments; none opens a prompt) |
| Generate worktree `.env.local` | `bun run env:local` |
| Revalidate its ports before launch | `bun run env:local -- --revalidate` |
| Create + migrate its dev/int/E2E databases and its `church-<worktree>` storage bucket | `bun run db:bootstrap` |
| Make a worktree ready (all of the above) | `bun run worktree:bootstrap` |
| Report databases and buckets of removed worktrees | `bun run db:prune` (`-- --apply` drops them) |
| Start / stop this machine's opt-in URL resolver | `bun run dns:start` / `bun run dns:stop` |

Local validation has three tiers, all planned by the same
`tooling/validation/affected.ts` module:

| Script | Runs | Needs Docker | Used by |
|---|---|---|---|
| `validate:no-docker` | lint and its guards, typecheck, seed-impact check, unit tests picked by import graph (whole suite when the graph can't trace a change or reaches no test) | no | the pre-push hook |
| `validate:affected` | the above, plus integration tests and the selected browser journeys, on whole affected workspaces; unit tests picked by import graph with the same fallbacks (whole suite under CI's `--daily-gate`) | yes | the per-ticket check, and the Develop Gate in CI |
| `validate` | everything | yes | final handoff and the release gate |

- `validate:no-docker`: quick feedback before a commit or push; a green run
  is not full validation, since CI runs integration and E2E.
- `validate:affected`: once per ticket, before reporting it done (see below).
- `validate`: final handoff or merge.

A whole local run that passes records its tier against the committed tree
and the merge-base its selection diffed against (`validate` against the tree
alone) in `~/.local/state/church/gate-passes/`, one JSON file per pass,
`<tree>-<merge-base>.json` (`<tree>-whole-tree.json` for `validate`), naming
the tier, commit and worktree (`tooling/validation/gate-pass.ts`). `<tree>`
is `git rev-parse HEAD^{tree}`, as on the gate's result line. CI records
nothing. `validate:no-docker` and
`validate:affected` then exit 0 at once on that tree when it already passed
an equal or stronger tier (`no-docker` < `affected` < `validate`), and say
which run they reuse, so `git push` after a green `validate:affected` skips
the hook's validation. Any uncommitted or untracked file, an amend that changes
files, a new commit or a moved merge-base validates again; the seed-impact
check still runs before a pass is reused. Runs with `--base`, `--e2e`,
`--only-e2e`, `--skip-e2e`, `--daily-gate`, `--dry-run` or under CI neither
reuse nor record a pass.

`validate:affected` runs lint, its guards and typecheck first and stops on a
failure; then unit tests run concurrently with integration tests, then E2E
only if both lanes pass. `validate` runs lint → typecheck → bundle budget →
unit tests concurrently with integration tests, then E2E. Output
lines carry a `[stage]` prefix, except GitHub workflow commands (annotations),
which must start their line, and a final table reports each stage's status.

### How the affected gate's log ends

`validate:affected` and `validate:no-docker` end every run except
`--dry-run` with (`tooling/validation/gate-summary.ts`):

```text
Gate summary:
| Stage | Status | Tests | Elapsed |
| --- | --- | --- | --- |
| lint | passed | - | 4.1s |
| test:unit | failed | 193 passed, 1 failed | 40.2s |
| test:e2e | skipped | - | - |
Seed impact: acknowledged
Journey fallbacks: none
VALIDATE_AFFECTED: FAILED <tree>
EXIT 1
```

Read the last two lines first. No `EXIT` line means the log is incomplete or
the run was killed. `<tree>` is the committed tree read before the run, with
`+uncommitted` appended when the working tree held more than that. Test counts
are the totals Vitest, Bun and Playwright print. A run that ends before any
stage (reused pass, undecided seed impact, busy slot, bad base) says
`No stage results.`. After a failure, `bun run` itself appends one
`error: script "validate:affected" exited with code <code>` line below `EXIT`.

### When a CI gate is red

Look in this order:

1. **Annotations.** Each failed test is an `::error` annotation on the PR
   with its file:line, title and error; `gh run view <run>` lists them under
   ANNOTATIONS. GitHub keeps at most 10 error annotations per step and 50 per
   job.
2. **Job summary.** On the run page, or the failed "Report failed phase"
   step in `gh run view <run> --log-failed`: `CI failure phase` names the
   failed setup step or `test-command`; for `test-command`, `Failed tests`
   lists every annotated test (title, file:line, first eight error lines; 30
   at most). Vitest adds its own `Vitest Test Report` counts.
3. **Failure bundles** of integration and E2E runs (see "Failure bundles"),
   then the job log.

The runners annotate only under `GITHUB_ACTIONS`; local output is unchanged.
Vitest adds its `github-actions` reporter by default there. Playwright's
`github` reporter runs before `list` (`apps/web/tests/fixtures/e2e-reporters.ts`),
because `list` ends a row only when the next output arrives.
`bun run test:validation` runs `bun test` through `tooling/ci/bun-test.ts`,
which turns its JUnit report into annotations and holds back the `::error`
lines `bun test` prints itself, keeping them only for a file that did not load,
so each failure has one annotation. Annotations reach GitHub only
at the start of a line: Turbo prefixes nothing under GitHub Actions, and
`run-managed.ts` and Varlock pass lines through. Each CI step that runs tests
uses `shell: bash tooling/ci/record-test-output.sh {0}`, which copies its
output to `$CHURCH_TEST_OUTPUT_LOG`, where `report-failure-phase.sh` finds
the annotated tests for the summary. A new test step needs that shell too
(`tooling/tests/ci/record-test-output.test.ts`).

Every command that reads configuration runs through Varlock from its
package directory, so the root and the package directory resolve the same
targets. Development commands declare `CHURCH_EXEC_PURPOSE=development`;
the destructive ones (`db:reset:dev`, `db:reseed:dev`, `db:clean`) print
a redacted preflight and refuse any database but this worktree's
development one. `db:generate` reads no values, so it is the
one database script outside Varlock. Nothing else loads value files: no
`--env-file`, no `dotenv`, and each package's `bunfig.toml` turns off Bun's
automatic `.env` loading. Unit tests read no values at all; the server's
unit project pins placeholders (`apps/server/vitest.config.ts`).

## Pre-commit

Lefthook runs these on the staged files, in parallel. Install and hook
failures name their fix; follow it and commit again.

| Job | Staged files | Does |
| --- | --- | --- |
| `biome` | scripts and JSON | fixes and restages |
| `css` | `.css` | refuses unformatted or invalid CSS; fix with `bun run lint:fix` |
| `spec-registration` | `*.spec.ts` under `apps/web/tests/`, `e2e-lanes.ts`, `journey-map.ts` | `validate:e2e-lanes`, then `validate:journey-map` |

Type errors are caught at pre-push, whose `validate:no-docker` runs `typecheck`, so commits stay
fast.

HTML is not formatted: Biome's HTML formatter is off in `biome.json`.

## Screenshot a screen

Drive the screen from a throwaway Playwright spec: the E2E config starts the
server and Vite, and you own the data. The example loads the
`cancelled-and-started` seed scenario (a Shift that started today at 00:00, and
a cancelled EventTimeBlock a week later) and captures the ChurchAdmin's
planning page and the leader's schedule builder. For another screen, load the
journey recipe that owns the state (`apps/server/seeds/e2e/recipes/`).

1. Save as `apps/web/tests/zz-screenshot.spec.ts`:

   ```ts
   import { expect, test } from '@playwright/test';
   import { z } from 'zod';
   import { loadJourneyRecipe } from '@/tests/fixtures/journey-recipes';
   import {
     ASSIGN_CYCLE_SCHEMA,
     ASSIGN_JOURNEY_BASE_SCHEMA,
     ASSIGN_PERSONA_SCHEMA,
     assignBuilderPath,
     assignMinistrySchema,
     newPersonaContext,
     signInPersonaPage,
   } from '@/tests/fixtures/journeys/assign-church';

   const SCHEMA = ASSIGN_JOURNEY_BASE_SCHEMA.extend({
     ministries: z.object({
       worship: assignMinistrySchema({ roles: ['usher'], sectors: ['main'] }),
     }),
     personas: z.object({
       admin: ASSIGN_PERSONA_SCHEMA,
       leader: ASSIGN_PERSONA_SCHEMA,
     }),
     cycle: ASSIGN_CYCLE_SCHEMA,
   });
   const VIEWPORT = { width: 1600, height: 1000 };

   test('screenshot', async ({ browser, page }, testInfo) => {
     const scenario = loadJourneyRecipe({
       recipeName: 'cancelled-and-started',
       schema: SCHEMA,
       testInfo,
     });
     const cycleId = scenario.cycle.id;

     await page.setViewportSize(VIEWPORT);
     await signInPersonaPage({ page, persona: scenario.personas.admin });
     await page.goto(`/app/cycles/${cycleId}`);
     await page.getByRole('button', { name: 'Expandir tudo' }).click();
     await expect(page.getByText('Noite').filter({ visible: true })).toBeVisible();
     await page.screenshot({ path: 'test-results/screens/planning.png' });

     const leader = await newPersonaContext({
       browser,
       persona: scenario.personas.leader,
     });
     const board = await leader.newPage();
     await board.setViewportSize(VIEWPORT);
     const ministryId = scenario.ministries.worship.id;
     await board.goto(assignBuilderPath({ ministryId, cycleId }));
     await expect(board.getByTestId('cycle-builder')).toBeVisible();
     await expect(board.getByText('Noite')).toBeVisible();
     await board.screenshot({ path: 'test-results/screens/builder.png' });
     await leader.close();
   });
   ```

2. Add `'zz-screenshot.spec.ts',` to `ISOLATED_SPECS`
   (`apps/web/tests/fixtures/e2e-lanes.ts`); the config refuses an unlisted
   spec.
3. Run `bun run test:e2e -- tests/zz-screenshot.spec.ts`. The images land in
   `apps/web/test-results/screens/`, which the next E2E run empties. A
   `[WebServer] … exit code 143` line after the run is Vite being stopped.
4. Downscale before reading: `convert in.png -resize 800x out.png` (`magick`
   on ImageMagick 7).
5. Delete the spec and its `ISOLATED_SPECS` line.

What the example already handles:

- **Sign in and choose the church**: `signInPersonaPage` (the test's own
  `page`) and `newPersonaContext` (each further persona) sign in over HTTP and
  select the Active Church. Give each persona its own context: a second sign-in
  on one fails with `MISSING_OR_NULL_ORIGIN`.
- **Stable locators**: prefer `getByTestId`, then `getByRole` with the pt-BR
  name (`m.<key>({}, { locale: 'pt-BR' })` from `@church/i18n/messages`).
  Lists render a table and cards at once, one hidden by CSS, so a text locator
  needs `.filter({ visible: true })`.
- **Framing**: the app scrolls inside its shell, so `fullPage` stops at the
  viewport. Enlarge the viewport instead.
- **Fonts**: the E2E config blocks Google Fonts, so no web font ever loads and
  the app renders in the system font. Wait for an element: a wait for a Google
  font never succeeds.

## Test placement

Tests, and every test helper, setup file, fixture, mock and contract suite,
live in the owning project's `tests/` directory at the path that mirrors
`src/`, never under `src`. Tests import source as `@/…`, other test files as
`@/tests/…` and server seeds as `@/seeds/…`; a relative import only for a file
in the same folder. `bun run lint` and every `validate:affected` run the
guard (`bun run validate:test-placement`) and fail otherwise.

## Named parameters

`bun run validate:named-parameters` (`tooling/validation/named-parameters-guard.ts`)
enforces constitution VII on `apps/*/src` and `packages/*/src`, skipping
generated files and `tests/`. It fails on a function, method, constructor,
interface method signature or function type with more than one parameter, and
on an inline object type in a parameter, variable, return or `as` position.
`bun run lint` and every `validate:affected` run it. A function passed directly
to a dependency's API is exempt; a named function whose signature a framework
controls carries `// named-parameters-ignore: <reason>` directly above its
declaration. Details: [ADR-0010](../adr/0010-mechanical-rules-enforced-by-tooling.md).

## Server types

`bun run validate:server-types` (`tooling/validation/server-types-guard.ts`)
fails on every `interface` and `type` declared in a server implementation file,
printing them grouped by folder with a total. It checks `apps/server/src/`
`application/`, `infrastructure/`, `api/`, `domain/services/` and `main/`, and
skips `.types.ts` siblings, `.d.ts` files and `api/dtos/`. Domain contracts,
entities and errors sit outside those folders. `bun run lint` and every
`validate:affected` run it, with no baseline and no suppression comment
([ADR-0010](../adr/0010-mechanical-rules-enforced-by-tooling.md)). Move a
reported type to its home:
[Contracts and composition](backend.md#contracts-and-composition). The guard
checks only where types are declared; the rest of that section is review's job.

## List order

`bun run validate:list-order` (`tooling/validation/list-order-guard.ts`) holds
the backend's ordering rule ([List queries](backend.md#list-queries)). It fails
on a Drizzle `.select()`, `.selectDistinct()` or `.selectDistinctOn()` chain, or
a `union`/`intersect`/`except` call, in `apps/server/src/infrastructure/` that
can return several rows and has no `.orderBy()`. `bun run lint` and every
`validate:affected` run it. These pass without a comment:

- a chain with `.limit(1)`;
- a select of aggregates only (`count()`, `max(…)`, or a `sql` template that
  starts with `count(`, `sum(` and the like) with no `.groupBy()`;
- a subquery: a chain passed straight to a call (`exists`, `inArray`), aliased
  with `.as()`, the source of an `INSERT … SELECT`, or a builder variable used
  only as call arguments.

Any other read whose order does not matter carries a one-line
`// list-order: <reason>` comment. The comment leads the statement or the chain,
wherever Biome puts it (after a ternary's `?`, inside parentheses). An opt-out
without a reason fails. The guard sees only chains, so a builder returned to
the caller needs the comment or its callers' `.orderBy()`. It does not judge
whether an `ORDER BY` is total: that, and filtering in SQL, stay with review.

## Presentation text

`bun run validate:presentation-text` (`tooling/validation/presentation-text-guard.ts`)
finds authored copy that bypasses the `@church/i18n` catalog. It parses each
file (no type information) and reports every finding as
`path:line:column: <context> "<text>": use a catalog message (m.*) or pass translated content`,
exiting nonzero on any. Pass repo-relative paths after `--` to check only
those files. It runs as the last step of `bun run lint`, so a finding fails
lint and every `validate:affected`.

**Scope.** All of `apps/web/src` (shared `components/ui` included) and
`apps/desktop/src`; in `apps/server/src` only the email, notification and
response boundaries below. Skipped: `tests/`, Paraglide output, `*.gen.*`, `*.d.ts`,
files with a generated header, seeds, catalogs, `packages/*` (generic code
with no presentation), `apps/fumadocs` and `tooling/`.

**Copy** is a literal whose authored text holds a letter once markup tags
(and `<!doctype>`), HTML entities, URLs and email addresses are removed. An
interpolated value is runtime data, but a literal inside an interpolation is
copy of its own (`` `${ready ? 'Ready' : name}` `` reports `Ready`). Punctuation, separators, symbols and digits alone are fine.
Capitalization and spaces prove nothing: `'Close'` and a lower-case
`aria-label="breadcrumb"` are copy; the context decides, not the wording.

**Presentation contexts (UI scope).** A literal reaches a context directly or
through `?:` branches, `&&`, `||`, `??`, `+`, parentheses and `as`/`satisfies`;
a call result, identifier or property read is runtime data.

| Context | Example |
| --- | --- |
| JSX text | `<span className="sr-only">Close</span>` |
| JSX child expression | `{open ? 'Hide' : m.show()}`, `` {`${n} items`} `` |
| Copy attribute: `aria-label`, `aria-description`, `aria-roledescription`, `aria-valuetext`, `aria-placeholder`, `alt`, and copy names (below) | `placeholder="Search"`, `submitLabel="Save"` |
| Property, variable or parameter default with a copy name | `{ label: 'Draft' }`, `const emptyText = 'None'`, `({ closeLabel = 'Close' })` |
| Every value of a map or list variable with a copy name | `const STATUS_LABELS = { open: 'Open' }` |
| Notification content: `title`, `body`, `actionLabel`, `kindLabel` of an object literal that has both `title` and `body` | `{ title: m.title(), body: 'Please join' }` |
| `name`/`header` of each column of a `columns` attribute given inline, as a same-file constant, or as a call to a same-file function returning an array literal | `<DataTable columns={COLUMNS} />` with `const COLUMNS = [{ id: 'name', name: 'Name' }]` |
| Return of a function with a copy name | `function statusLabel() { return 'Open'; }` |
| First argument of `toast`, `toast.success/error/info/warning/message/loading`, `alert`, `confirm`, `prompt` (`window.` too) | `toast.error('Failed')` |
| Zod check message (call chain rooted at `z`) | `z.string().min(2, 'Too short')`, `.refine(f, { message: '…' })` |
| `document.title` assignment | `document.title = 'Church'` |

A copy name is `label`, `title`, `message`, `description`, `placeholder`,
`heading`, `subheading`, `subtitle`, `caption`, `tooltip`, `hint` or `copy`
(optionally plural), the camelCase suffix of one of these or `Text`
(`submitLabel`, `emptyText`), or the SCREAMING_CASE suffix (`STATUS_LABELS`).
A bare `text` is not one: it is too often a CSS or data key. In a map or
list, an object with a copy-named field (`{ value: 'draft', label: m.draft() }`)
is a record: only its copy-named fields are checked, so ids, values and
tones beside them stay technical; an object without one is a nested map and
its values are checked.

**Server boundaries.** Literal values of the `EmailContent`/`RenderedEmail`
fields `subject`, `greeting`, `heading`, `footer`, `html`, `text`, each
element of `facts` and `list`, `label` inside an `action` object; the
notification content fields above; and `message` in an object passed to
`.send(…)`. Server `title` and `body` count only together, so OpenAPI
`info.title` and Fastify schema `body` stay technical. Other server
strings (OpenAPI descriptions, domain-error messages, Zod DTO issues) are
English diagnostics.

**Never copy.** Strings inside `throw`, `new …Error(…)`, `console.*`,
`logger.*` and `*.log.*` calls; Zod `literal`/`enum`/`default` values and the
pattern argument of `startsWith`/`endsWith`/`includes`; a copy-named function
whose declared return type is a literal union (`'hourly' | 'day_based'`),
since it returns keys.

**Not followed** (review these by hand): copy that reaches a presentation
context through a call, an import or a differently named variable or
property (imported or parameter-supplied `columns`, a column `name` passed
anywhere but a `columns` attribute, a thrown message later shown with
`toast.error(error.message)`), JSX built with `createElement`, and
`toast.promise` options.

**Suppression.** Put
`// presentation-text-ignore: <why this text is not translatable copy>`
(`{/* presentation-text-ignore: … */}` inside JSX) on its own line directly
above the reported line; it covers that one line only. The reason is
required and must name the technical, nonlinguistic nature of the text
(a keyboard key name, a protocol token). The guard fails on a suppression
with no reason and on one whose next line has no finding. There is no
file-wide, folder or baseline exemption, and a parked feature is no reason
to suppress.

## Journey map

`bun run validate:journey-map` (`tooling/validation/journey-map-guard.ts`)
discovers every `.spec.ts` file under `apps/web/tests/`, recursively, and
fails unless each one is referenced by `JOURNEY_MAP` or
`CRITICAL_SMOKE_SPEC_PATHS` in `tooling/validation/journey-map.ts`, and each
reference in either list names a discovered spec. Paths are web-root-relative
with the `tests/` prefix. It lists unmapped specs, then stale references, so a
rename shows both halves; repeated references and overlap between the lists
are fine. It also fails a mapping whose `sourcePathPrefix` matches no
production file (the plan's own rule, `tooling/validation/production-path.ts`),
so a moved or deleted file takes its mapping with it. `bun run lint` and every
`validate:affected` run it, so a change that only
adds, renames or deletes a spec still fails on drift with the same
diagnostics. It needs no browser, database or running application. Whether a
live prefix maps the right specs stays a review decision
([ADR-0004](../adr/0004-test-strategy-and-ci-gate-policy.md)).

A production change no mapping covers runs the critical smoke set. The plan
also lists the changed files that selected no journey.

A pure refactor may skip journeys with a commit trailer
`Journey-Impact: none - <reason>`. A blank reason does not count, and the plan
refuses it by commit. It follows the
[seed-impact](#seed-impact) rule for the branch's own commits: the plan names
the commit behind each accepted reason, and a borrowed trailer is refused, so
the journeys run. One trailer skips the journeys of the whole diff, so use it only when
every change on the branch is behaviour-neutral. Specs requested with `--e2e`
still run, and a full local run that skipped journeys records no gate pass.

### Adding a Playwright spec

1. Add its path to `ISOLATED_SPECS` in `apps/web/tests/fixtures/e2e-lanes.ts`.
2. Add it to `JOURNEY_MAP` or `CRITICAL_SMOKE_SPEC_PATHS` in
   `tooling/validation/journey-map.ts`.
3. Run `bun run lint`, not `bunx biome check`: only `lint` runs both guards.

## turbo.json narrowing

A root `turbo.json` change selects every workspace, except when every
difference from the merge-base sits in `<package>#<task>` entries of one
package (`readTurboNarrowing` in `tooling/validation/affected-plan.ts`). The
plan then selects that package alone, without its dependents, with its whole
unit suite, and prints:

```text
turbo.json narrowed to @church/web: only its own task entries differ (@church/web#build)
```

The package must be one the plan can select (`WORKSPACES`, so not
`@church/i18n`) and have a test layer. For one without (`@church/config`,
`@church/env`, `@church/time`) every workspace stays selected, and the plan
prints:

```text
turbo.json not narrowed: @church/time has no test layer in the plan, so every workspace is selected (@church/time#build)
```

The tooling tests run either way.

## Bundle budget

`bun run validate:bundle-budget` (`tooling/validation/bundle-budget.ts`)
prints the gzip size of every JS and CSS chunk in `apps/web/dist/assets` and
fails, naming the chunk, when the entry chunk, the entry CSS or a shared chunk
(a `modulepreload` in `index.html`) is over its limit. Lazy chunks are printed
only. It never builds: `validate` runs it right after the type check, which
builds `dist`, and `validate:affected` and `validate:no-docker` do the same
when `@church/web` is affected. It is not part of `lint`. The limits are `LIMITS` in
the script; raise one only on purpose and say why in the PR. `shared` is one
limit for each shared chunk on its own, so a small chunk can grow up to it
unnoticed. It does not name the module that grew: the build writes no stats
file.

## Seed impact

A change to the database schema or migrations, persistence (repositories,
mappers, entities), authentication, tenancy, or scheduling can invalidate
curated seed data. `validate:affected` selects the seed contracts for it
(`bun run test:seeds` runs the same set: `tests/seeds/` plus the
wrong-purpose and wrong-target refusal tests of `@church/db`) and refuses to
validate until the change carries one decision:

- update `apps/server/seeds` (or its `tests/seeds/` contracts) in the same
  change; or
- acknowledge no seed impact with a commit trailer
  `Seed-Impact: none - <reason>` (or `--no-seed-impact "<reason>"` for
  uncommitted work). A blank reason does not count.

The trailer lookup reads the commits between the validate base and `HEAD`,
and accepts only the branch's own: those above the open PR's base
(`gh pr view`; `origin/<base>`, else the local branch) or, without a PR,
above the validate base. The plan prints each accepted reason with its commit
and the ref used. A trailer from a lower stacked branch is refused: add one on
this branch. Without a PR the gate can't see a stack, so set `validateBase` to
the branch below (see
[Test loop and completion gate](#test-loop-and-completion-gate)). A failing
`gh` (offline, not signed in) counts as no PR.

`--dry-run` only reports the missing decision; the validating run fails.
The rules live in `tooling/validation/seed-impact.ts`, the commit lookup in
`tooling/validation/seed-acknowledgements.ts`. A deleted file keeps
its workspace in scope but selects no test file and, when no journey maps it,
no smoke fallback.

Use root Bun scripts by default. The focused-workspace exception is
`bunx turbo -F <workspace> <task> --only -- <test path>` (see
[Test loop and completion gate](#test-loop-and-completion-gate)). Generate
the API client only with `bun run api:generate`.

## Test loop and completion gate

While implementing a ticket, iterate on the existing tests for the behavior
you are changing, in the workspace that owns it. Run them from the repository
root through the focused-workspace exception, which keeps the package's own
task script (its Vitest projects and, for integration, Varlock and managed
diagnostics). It skips the root `test:unit`'s `TZ=Asia/Kolkata`, so the
completion gate is still what catches timezone-dependent failures:

```sh
bunx turbo -F @church/server test:unit --only -- tests/api/auth/active-church-pre-validation.test.ts
```

`-F` takes the package name (`@church/server`, `@church/web`, `@church/core`, …); the task is
`test:unit` for unit and component tests or `test:integration` for
integration tests; the path is relative to that workspace. Integration tasks
need this worktree's databases (`bun run worktree:bootstrap`). Story E2E keeps
`bun run test:e2e` and the critical-journey policy of
[ADR-0004](../adr/0004-test-strategy-and-ci-gate-policy.md).

Run `bun run validate:affected` once, after the ticket's implementation and
focused tests are complete and before reporting it done. It is the
completion gate, not the inner loop: it also selects dependent workspaces,
seed contracts and critical journeys. Rerun it only after diagnosing and
repairing a failure, or after a later relevant change invalidates the
result. One run per ticket is normal and two after a repair; that is an
expectation, never a cap that lets a failing gate be handed off.

The gate takes minutes. Start it with your shell tool's supported background
execution and wait for that tool's completion notification or documented
completion primitive; do not wait with `sleep`, repeated status polling, or
a monitoring tool your runtime does not provide. Starting the gate is not
passing it: read its exit status and stage table, and fix every failure
before handoff. `bun run validate` stays the final handoff or merge gate.

A merge that brings in work which already passed its own gate is not a new
change: rerun lint, typecheck and the focused suites, and run the gate once,
after the last merge. Rewiring test constructors for a dependency-injection
change is wiring, not a behaviour change. Route it through one builder in
`tests/test-support/`.

After a red gate, do not rerun it blind: iterate on the focused failing test
(the focused-workspace command above), then run the gate once more. On a
wrapper run (a spec with ticket branches that get no CI), workers run the
per-ticket gate once each and the coordinator owns the single final
`bun run validate` on the integration branch; workers do not run it.

With no `--base`, `validate:affected` diffs against the branch's
`validateBase` git setting, else `develop`. On a wrapper run the coordinator
sets it when it creates each ticket worktree (nothing infers the integration
branch), so the gate and the seed-impact trailer lookup see only the ticket's
own commits:

```sh
git config branch.<ticket-branch>.validateBase spec/<n>-<slug>
```

`--base` still wins, a setting naming a missing ref fails the gate, and the
dry run's `Base ref:` line shows the choice.

The guards that compare HEAD with a base commit fail closed when the clone
lacks it (#1233): `validate:affected`, the seed and journey trailer lookup
(`tooling/validation/seed-acknowledgements.ts`) and
`validate:constitution-version`, which resolves its base the same way (else
`origin/$GITHUB_BASE_REF` in CI). No base found or a base that is not a
commit here exits 1, as does, for the two diffs, a base sharing no history
with HEAD (a shallow checkout); each message names the fix: fetch full history (`fetch-depth: 0` on `actions/checkout`, or
`git fetch --unshallow origin`). None has a flag to skip a missing base; every
CI job that runs them checks out with `fetch-depth: 0`
(`tooling/validation/base-commit.ts`).

## Validate slot

`validate`, `validate:affected` and `validate:no-docker` share one slot per
machine, across every worktree (`~/.local/state/church/validate.lock.json`,
`tooling/validation/validate-lock.ts`). Focused test commands
(`bunx turbo -F … --only`, `test:unit`, `test:e2e`) never take it, and CI
skips it. A second gate prints, and repeats every 30 seconds:

```text
⏳ Waiting for the validate slot: held by <worktree> (pid <pid>, <tier>, started <n> min ago).
```

That line means the gate is queued, not hung: it starts when the holder
finishes. A holder whose process died is taken over (`Taking over the validate
slot from dead holder …`) with no manual cleanup; the slot is released when
the gate passes, fails, or gets SIGINT/SIGTERM. After 30 minutes
(`CHURCH_VALIDATE_LOCK_TIMEOUT_MS` overrides) the run exits 75 naming the
holder: nothing was validated, so run the gate again to keep waiting; it is
not a check failure to repair.
A run that got the slot prints `Waited Ns for the validate slot.` after its
stages.

The pre-push hook's `validate:no-docker` does wait, but at most 5 minutes
(`lefthook.yml` sets the timeout): it must not hang a push behind a 10+ minute
gate, and it must not push unvalidated behind one either. If the holder is
still running, the push fails naming it; retry when it finishes. A deliberate
`git push --no-verify` is the maintainer's override.

Local `test:e2e` runs hold one lock shared by every worktree: a second run
prints that it is waiting and starts nothing until the first ends (CI skips
the lock). A failed run keeps its E2E database state for inspection; the next
run resets it.

The server relies on its package TypeScript configuration; run server scripts
through their package scripts. `apps/server/auto-generated-api.yaml`
is input to API generation, not a hand-edited contract.

## Worktree bootstrap

Creating a Worktrunk worktree runs the checked-in, blocking `pre-start` hook
(`.config/wt.toml`): `bun run worktree:bootstrap`. It installs from the frozen
lockfile, runs `db:start` (starts or verifies the shared services and waits
for their healthchecks), runs `env:local`, then `db:bootstrap`.
`wt switch --create -x <task>` starts the task only after it succeeds.

Local Compose services are shared dependencies, not per-worktree state. The
`db:start`/`db:watch`/`db:stop`/`db:down` scripts always drive the primary
checkout's `docker-compose.yml` (`tooling/worktree/shared-compose.sh`), from
any worktree, so a branch's copy never starts or reshapes them. A Compose
change takes effect once it is in the primary checkout.

Object storage is the Compose `storage` service (RustFS, S3 API on port
9000). `env:local` points the server's `S3_*` and `STORAGE_PUBLIC_URL` at it
and at the worktree's own `church-<worktree>` bucket, which `db:bootstrap`
creates with anonymous read on `public/*` only; worktree removal and
`db:prune -- --apply` delete it. The adapter contract suite
(`apps/server/tests/integration/storage/`) runs against it; HTTP tests inject
the in-memory fake (`tests/test-support/in-memory-object-storage.ts`).

- **Approval**: Worktrunk asks once to approve the project hook and again
  whenever its command changes; `--yes` approves non-interactively. Declining
  skips it, leaving the worktree unbootstrapped.
- **Recovery**: a failed hook keeps the worktree and branch but aborts the
  switch. `cd` into the worktree (`wt switch` does not rerun `pre-start`), fix
  the cause it printed (its failure bundle keeps the output; see "Failure
  bundles"), and rerun `bun run worktree:bootstrap`. Every step is
  idempotent; completed databases are kept.
- **Non-generated values**: `env:local` also writes the local default
  `ENABLE_DEBUG_ENDPOINTS=true`. Machine-shared values, such as
  optional `RESEND_*` and optional
  `CHURCH_DEV_DOMAIN`/`CHURCH_DEV_ADDRESS` (see "Private worktree URLs"), live
  once in the ignored `church-shared.env` in the shared Git directory, which
  every worktree's `.env.local` copies; rerun `env:local` after editing it. It
  may override a default, never a generated key. The file is optional: a
  worktree without it still boots. Seed it from the primary if you use Resend:
  `grep -E '^RESEND_[A-Z_]+=' .env > "$(git rev-parse --git-common-dir)/church-shared.env"`.
- **Before the first commit**: the commit hooks run from `node_modules`, so a
  worktree created without the hook (plain `git worktree add`, Orca)
  bootstraps before it commits; otherwise `commit-msg` fails at once, naming
  the bootstrap.
- **Known transient**: under load the `@church/i18n` compile can hit
  `LixError: Lix open did not settle within 30000ms`. It retries once by itself
  (`tooling/i18n/compile.ts`); if the retry fails too, rerun the bootstrap.
- **Primary checkout**: run `bun run worktree:bootstrap` once, explicitly.
  `env:local` refuses to run while a package value file exists
  (`apps/{server,web}/.env[.local]`, `packages/{db,auth}/.env[.local]`):
  Varlock would prefer it over the root `.env.local`. Move any
  machine-shared value it holds into `church-shared.env` (above), then
  delete it. The generated URL set and secret then override the legacy root
  `.env` (`church-develop.<CHURCH_DEV_DOMAIN>` URLs, or
  `church-develop.localhost` without a domain, see below; existing sessions
  are logged out), and pending migrations are applied to the live `church`
  database. No command reads the legacy root `.env` directly; Varlock still
  loads it beneath `.env.local`, so delete it once `church-shared.env` holds
  its machine-shared values.

## Development email

One server setting, `DEV_EMAIL_SENDER`, selects who sends email (Transactional
and Notification alike, content and recipients unchanged): `smtp` (default when
unset), `resend` or `capture`. An invalid value fails configuration. `NODE_ENV=test`
(and the E2E server) always use capture; production always uses Resend.
Selection is exclusive: nothing falls back to another sender, and a failed
send surfaces through the existing error handling and outbox retries. The
server starts even when SMTP is down. Restart the server to change the setting.

- **smtp**: Mailpit from the root Compose (`bun run db:start`). SMTP is
  `localhost:1025`; the inbox is `http://<machine IP>:8025`. Messages persist in
  the `mailpit-data` volume across restarts; nothing is relayed. Read
  verification codes and links in that inbox. Another server: set `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_SECURE` (implicit TLS, usually 465), `SMTP_REQUIRE_TLS`
  (insist on STARTTLS, usually 587; otherwise it is used only when offered),
  `SMTP_USER`/`SMTP_PASSWORD` (set together; credentials are sensitive, keep
  them in `church-shared.env`, never committed) and `SMTP_FROM_EMAIL` in
  `church-shared.env`. Bad credentials or TLS failures surface as send errors
  (a rejected login is permanent, connection errors retry); they never switch
  sender, and an incomplete credential pair fails configuration at startup. A real relay delivers to original
  recipients. SMTP has no provider-backed idempotency: an uncertain send that is
  retried can arrive twice.
- **resend**: needs `RESEND_API_KEY`; real recipients. Resend's default
  `onboarding@resend.dev` sender only reaches the account owner's address; use a
  verified domain in `RESEND_FROM_EMAIL` for others.
- **capture**: in-memory; the debug readback of codes works only in this mode.

Pending outbox rows use the sender selected when they are processed, including
after a restart. Switching to `resend` or a real SMTP relay can send existing
pending rows to their original recipients; review them first.

## Private worktree URLs

`env:local` puts each worktree's manual URL set (`BETTER_AUTH_URL`,
`VITE_SERVER_URL`, `CORS_ORIGIN`) on one private hostname and its assigned
ports (ADR-0005). The hostname's domain is this machine's, so worktrees are
reached on whichever machine runs them:

```text
http://church-<identity, _ as ->.<CHURCH_DEV_DOMAIN>:<CHURCH_WEB_PORT>     web
http://church-<identity, _ as ->.<CHURCH_DEV_DOMAIN>:<CHURCH_SERVER_PORT>  API
```

Without `CHURCH_DEV_DOMAIN`, the domain is `localhost`
(`church-<identity>.localhost`): Chrome and Firefox resolve it to loopback
with no setup and treat it as a secure context, so it works only on this
machine. The primary checkout is `church-develop.<domain>` on ports 3101
(web) and 3100 (API). Read a worktree's values from its `.env.local`. Each
worktree has its own hostname, so its session cookies stay separate.

Vite listens on every interface. It accepts `*.dev.home.arpa`, the machine
domain (when outside that suffix), `localhost` names, and IP literals as
`Host`, and refuses other names with 403. E2E and CI never use these names:
Playwright pins a `localhost` URL set on the `PW_*` ports
(`tooling/env/e2e-environment.ts`), whatever `.env.local` says.

`bun run dev` serves this URL set: the server and web `dev` scripts run
through Varlock, whose service schemas map `CHURCH_SERVER_PORT` and
`CHURCH_WEB_PORT` to each process's `PORT`.

### Per-machine setup

Nothing in the repository names a machine or an address; each machine
configures itself in its ignored `church-shared.env`
(`$(git rev-parse --git-common-dir)/church-shared.env`):

- `CHURCH_DEV_DOMAIN`: this machine's domain, e.g. `homelab.dev.home.arpa`
  or `laptop.dev.home.arpa`. A lowercase DNS name; `env:local` refuses a
  malformed one.
- `CHURCH_DEV_ADDRESS` (optional): the IPv4 address other devices reach this
  machine on. Defaults to `tailscale ip -4`; a LAN IP is allowed.

1. Set them, then run `bun run env:local` in every worktree whose URLs should
   move (it rewrites them), and `bun run dns:start`.
2. **Tailscale split DNS**, once per machine: in the admin console, go to
   DNS → Nameservers → Add nameserver → Custom. Enter this machine's
   Tailscale IP, enable "Restrict to search domain", and enter
   `<CHURCH_DEV_DOMAIN>`. MagicDNS is not required.
3. Optional, for LAN devices without Tailscale: on the LAN resolver
   (currently 192.168.0.201), conditionally forward `<CHURCH_DEV_DOMAIN>` to
   this machine's LAN IP, and set `CHURCH_DEV_ADDRESS` to that LAN IP.

`bun run dns:start` renders `church-dnsmasq.conf` beside `church-shared.env`
and starts only the `dns` service of the primary checkout's Compose file (as
`db:start` does, so the service exists once that file has it). The resolver
answers `<CHURCH_DEV_DOMAIN>` and every name below it with
`CHURCH_DEV_ADDRESS`, returns no data for other record types there, refuses
every other name, and listens only on that address, port 53. The service sits
behind the `dns` Compose profile, so `db:start`, `worktree:bootstrap`, CI, and
E2E never start it. It restarts with Docker until `bun run dns:stop`; run
that before `bun run db:down`, which leaves the resolver alone.

To check from any tailnet client, run
`tailscale dns query church-develop.<CHURCH_DEV_DOMAIN>` (Tailscale 1.76+) or
`dig +short church-develop.<CHURCH_DEV_DOMAIN>`. Both should print the
machine's address. Two machines with different domains resolve independently:
query one name under each domain from a third device.

### Recovery

- **Names stop resolving after a reboot**: Docker may start before the
  machine has its address (for example before Tailscale is up), and it does
  not retry a failed port binding. Check with
  `docker ps --filter name=church-dns`, then rerun `bun run dns:start`.
- **Machine address changed** (re-joined the tailnet, new LAN lease): update
  `CHURCH_DEV_ADDRESS`, or rely on the `tailscale ip -4` default, and rerun
  `bun run dns:start`. Then point that machine's split-DNS nameserver (and
  any LAN forward) at the new IP.
- **Domain changed**: rerun `bun run env:local` in each worktree and
  `bun run dns:start`, then change the split-DNS rule's search domain.
- **Tailnet recreated**: redo the split-DNS rule on every machine.

If a client still gets stale answers, check its DNS configuration with
`tailscale dns status`.

## Worktree removal

`wt remove` runs the checked-in `pre-remove` hook, which drops exactly the
removed worktree's three databases (`church_<worktree>_dev|int|e2e`, named by
its generated `.env.local`) after terminating their connections. It runs the
primary checkout's copy of `tooling/worktree/remove-worktree-databases.ts`, so
it also cleans worktrees branched before the script existed. It never drops
the primary's databases, nor an identity another active worktree also holds.
It also drops the worktree's per-worker integration databases
(`church_<worktree>__w<N>_int`), which the server integration run clones from
its migrated `int` database before the tests start; `db:prune` attributes them
to the same worktree. The server integration project runs its files on two
workers (`INTEGRATION_WORKER_COUNT`, the cap the unit projects use), worker
`VITEST_POOL_ID` N on its `_w<N>_int` database; a third worker fails fast.
It never blocks the removal: with PostgreSQL down, a primary checkout without
the script, or any other failure, it warns and keeps the databases.

`bun run db:prune` recovers what removal left behind (PostgreSQL was down, or
`--no-hooks`). It compares the `church_<worktree>_dev|int|e2e` databases with
the identities of every active worktree (one whose directory was deleted
without `wt remove` no longer counts) and lists the stale ones. An active
worktree owns every `church_<worktree>_…` database, its test scratch
databases included, so a worktree that still exists is never touched; only
`bun run db:prune -- --apply` drops them. `church`, `church_test`, and every
other database outside that shape are never selected. Worktrunk asks to
approve the hook once, as for `pre-start`.

## Sign-in load harness

`bun run perf:sign-in` (`tooling/perf/`) measures `/login` as a slow phone
loads it from the deployment: use it before and after a change to what the
sign-in page downloads or renders. It builds the web app with
`VITE_SERVER_URL=/` (replacing `apps/web/dist`), serves it over HTTP/2 with the
`deployment/Caddyfile`'s zstd/gzip and `/api` proxy, and loads it in system
Chrome at 390x844 on Slow 4G (150 ms RTT, 1.6 Mbps) with 4x CPU slowdown. It
prints first paint, LCP and form usable (the real submit button enabled, the
boot shell gone) beside the
[#1121](https://github.com/tiagoluizpoli/church/pull/1121) reference, and
saves a filmstrip, `tmp/perf-sign-in/frame-<ms>ms.png`, 390 px wide, at most
one frame per 200 ms. Tile the frames into one downscaled sheet before reading
them.

It needs Google Chrome, `openssl`, a bootstrapped worktree and a free
`CHURCH_WEB_PORT` (stop `dev:web`). It uses the API already on
`CHURCH_SERVER_PORT`, else starts `dev:server` and stops it afterwards. One run
is one sample on this machine's CPU: compare runs from the same machine.

Facts it encodes, for any other browser measurement:

- **Open the app on the worktree's [dev hostname](#private-worktree-urls),
  never `localhost`.** The API's CORS origin is that hostname on the web port:
  `localhost` gets no CORS headers and its POSTs get 403. With
  `CHURCH_DEV_DOMAIN` set, `bun run dns:start` makes the name resolve. The
  harness's page is `https`, so it loads `/login` but cannot submit the form.
- **Use system Chrome (`channel: 'chrome'`) for the WebGL2 scene.** Headless
  Chrome draws it in software (SwiftShader), so the animation appears about 1 s
  later than on a GPU, or never when it misses its 4 s ready timeout; the three
  times come before it. `--headed` opens a window and draws on the GPU.
  Playwright's default headless shell refuses WebGL2 under
  `failIfMajorPerformanceCaveat`.
- **A script outside the repository cannot import `@playwright/test` by name.**
  Import it from
  `<repo>/node_modules/.bun/@playwright+test@<version>/node_modules/@playwright/test`.
- **The E2E config blocks Google Fonts** (`--host-resolver-rules` in
  `apps/web/playwright.config.ts`). Under it no web font loads, so a wait for
  one never ends. The harness loads them, as a visitor does.
- **HTTP/2 matters.** Over HTTP/1.1 the same build measured LCP ~2.3 s instead
  of ~1.4 s.

## Dev module cap

`bun run validate:dev-module-cap` (`tooling/validation/dev-module-cap.ts`)
loads `/login` from `vite dev` in system Chrome, counts the script requests to
vite, and fails above the cap, printing the count and the cap. `vite dev`
serves modules unbundled, so one change can add thousands: compiling
translations to one module per message took the page from about 200 requests to
2,503 ([#1121](https://github.com/tiagoluizpoli/church/pull/1121)).

It runs **on demand only**: run it after a change to how dev compiles or
resolves modules (translations, Vite config or plugins), to dependencies, or to
what the sign-in page imports. It is not part of `validate` or
`validate:affected`: it takes about 30 s, almost all of it starting the two dev
servers, and it needs system Chrome and a generated `.env.local`, neither of
which the CI Release Gate's container has.

It needs what the [sign-in load harness](#sign-in-load-harness) needs, except
`openssl`. It uses the servers already on `CHURCH_SERVER_PORT` and
`CHURCH_WEB_PORT`, else starts `dev:server` and `dev:web` and stops them
afterwards. It counts the page's last load (vite reloads it after optimizing a
new dependency), with the service worker blocked, until the form shows and
requests stop for 3 s.

The cap is `CAP` in the script: 220, from 201 requests on 2026-11-27 plus about
10%. Raise it only on purpose and say why in the PR.

## Failure bundles

A failed `env:local`, `db:bootstrap`, `db:prune`, or `worktree:bootstrap`
step, a failed package `test:integration` or `test:e2e` run, and a removal
that keeps its databases, leaves one diagnostic bundle and prints its path.
Bundles live in the shared Git directory
(`$(git rev-parse --git-common-dir)/church-failure-bundles/<time>-<command>-<worktree>-<suffix>/`),
so they outlive a removed worktree. Successful commands leave nothing.

- `bundle.json`: command, failed step, command line, timing, exit status
  (a removal that keeps its databases records the hook's 0), worktree
  identity and path, commit, execution purpose, assigned ports, the
  worktree's three database targets as host, port, and name, and the
  bundle's artifact files. `purpose` is the command's `CHURCH_EXEC_PURPOSE`:
  null for the lifecycle commands, which serve every purpose. An
  integration bundle's `step` names the package that failed.
- `output.log`: the command's output, sanitized, then cut to its first 100
  and last 300 lines, each at most 1,000 characters.
- `artifacts/` (E2E only): Playwright's `apps/web/test-results` for the
  run: `error-context.md` reports and traces. Playwright
  keeps a trace for every failed test (`retain-on-failure`). Text files are
  sanitized; each `trace.zip` is rewritten without its storage state,
  cookie and local-storage values, authentication headers, or secret-named
  fields, and every value found there is also redacted wherever else it
  appears in the trace (`tooling/diagnostics/sanitize-trace.ts`).
  Images (trace screencast frames, any screenshot) are copied unchanged,
  so what the page showed, such as a seeded E2E account's email, remains
  visible as pixels.

Sanitizing (`tooling/diagnostics/sanitize.ts`) removes sensitive values
from every value file (`.env.local`, `.env`, package files,
`church-shared.env`), URL credentials, query strings and fragments, cookie,
authorization, and API-key headers, secret-named assignments, JSON fields,
and flags, JWTs, private keys, email addresses, and invitation identifiers.
Sensitive-named variables of the process environment count as known values
too, since CI secrets arrive only through the job environment. Bundles
never copy value files, the environment, or `tests/.auth` storage states.

Recording a bundle deletes bundles older than 14 days; nothing else in the
directory is touched. `run-managed.ts` (`tooling/diagnostics/`) wraps the
managed scripts, including each package's `test:integration`
(`--step <package>`); `e2e-local-lifecycle.ts --artifacts <dir>` records
E2E failures. A managed command nested in another only passes through, so
one failure yields one bundle.
`CHURCH_FAILURE_BUNDLES_DIR` redirects bundles elsewhere (tests, CI); Turbo
passes it to the integration and E2E tasks.

In CI, `setup-church-ci` points `CHURCH_FAILURE_BUNDLES_DIR` at
`$RUNNER_TEMP/church-failure-bundles`. Each job that runs integration or
E2E tests uploads it as the `failure-bundles-<job>-<attempt>` artifact only
when the job fails; GitHub deletes it after seven days.

Finish the current implementation phase before review. Run focused tests,
then, once the ticket is complete, affected validation, plus the relevant story E2E when one exists; review
the modified files and repair every finding in the same phase. Fix lint,
format, and type errors directly—suppression directives require explicit user
permission. Install Playwright's pinned Chromium with `bunx playwright install
chromium` when its executable is absent.

## Rule inventory

Every rule in the [constitution](../../.specify/memory/constitution.md),
`docs/agents/*` and `docs/adr/*`, and how it is held (ADR-0010). A mechanical
rule is a fixed pattern a tool can decide; it names its cheapest check type
and either the check that enforces it or the follow-up issue that will add
one. A judgement rule stays with review, for the reason given. Add a row when
a rule is added; a new mechanical rule lands with its check or an issue.

| Rule | Source | Kind | Check type | Status |
| --- | --- | --- | --- | --- |
| I. Features start from a domain definition and planning | Constitution | Judgement | — | Review: whether planning was adequate is not a code pattern |
| II. Fastify + OpenAPI + orval at API boundaries, Zod for runtime validation, Drizzle for database access | Constitution, backend | Judgement | — | Review: which boundary needs which tool depends on what the code does |
| II. No `any` | Constitution | Mechanical | Biome rule | Enforced: `suspicious/noExplicitAny` |
| II. End-to-end type safety | Constitution | Mechanical | tsc setting | Enforced: `strict` and `noUncheckedIndexedAccess` in `@church/config/tsconfig.base.json`, `bun run typecheck` |
| III. Local dependencies come from the root `docker-compose.yml` | Constitution, ADR-0005 | Mechanical | Validation guard | Enforced: the `db:*` scripts drive only the primary checkout's Compose file (`tooling/worktree/shared-compose.sh`) |
| IV. Variables are declared in Varlock `.env.schema` files and validated by `@church/env` | Constitution, ADR-0005 | Judgement | — | Review: whether a new variable is declared in the right schema is a design call |
| IV. Only Varlock loads values: no `--env-file`, no `dotenv`, no package value files | Constitution, tooling, ADR-0005 | Mechanical | Validation guard | Enforced: `tooling/tests/env/legacy-env-loading.test.ts` (`test:validation`), and `env:local` refuses package value files |
| IV. Never commit secrets | Constitution | Judgement | — | Review: a secret is not a fixed pattern |
| V. Biome lints and formats; it passes before every commit | Constitution | Mechanical | Biome rule | Enforced: Lefthook `pre-commit` runs Biome on staged files (CSS read-only); `lint` in CI |
| TypeScript type-checks before it is pushed | Tooling | Mechanical | tsc setting | Enforced: Lefthook `pre-push` `validate:no-docker` (typecheck) |
| V. Conventional commits | Constitution | Mechanical | Validation guard | Enforced: commitlint in Lefthook `commit-msg` |
| `commit-msg` fails at once without `node_modules`; it never waits on an install prompt | Tooling | Mechanical | Validation guard | Enforced: `tooling/tests/validation/commit-time-tooling.test.ts` (`test:validation`) |
| `lint` writes nothing; fixing stays in `lint:fix` and the pre-commit Biome job | Tooling | Mechanical | Validation guard | Enforced: `tooling/tests/validation/commit-time-tooling.test.ts` (`test:validation`) |
| The `@church/i18n` compile retries once on the Lix open timeout, and on no other error | Tooling | Mechanical | Validation guard | Enforced: `tooling/tests/validation/i18n-compile.test.ts` (`test:validation`) |
| Commits run the Lefthook hooks (no `core.hooksPath` override, no `git commit --no-verify`) | Tooling | Mechanical | Claude hook | Enforced for agents: `tooling/claude/block-hook-bypass.sh`, a PreToolUse hook in `.claude/settings.json` |
| develop is PR-only: no tracked edits left uncommitted on a develop checkout | Tooling | Mechanical | Claude hook | Enforced for agents: `tooling/claude/flag-dirty-develop.sh`, a Stop hook in `.claude/settings.json` that stops the agent once to branch and PR them |
| Atomic commits are small and focused | Constitution | Judgement | — | Review: "focused" is a judgement about intent |
| VI. Specifications traverse `specifications-list.md` | Constitution | Judgement | — | Review: a planning process, not repository content |
| VII. Named object parameters: at most one parameter, named `interface`/`type` shapes, no inline object types | Constitution, backend, ADR-0010 | Mechanical | Validation guard | Enforced: `bun run validate:named-parameters`, part of `lint` ([#539](https://github.com/tiagoluizpoli/church/issues/539), turned on by [#547](https://github.com/tiagoluizpoli/church/issues/547)) |
| Business logic is separated from framework code | Constitution, backend | Judgement | — | Review: what counts as business logic is a judgement; the import shape is the row below |
| Server layers import inward only (`api`/`application`/`infrastructure` → `domain`) | Backend | Mechanical | Biome rule | Enforced: `noRestrictedImports` overrides in `biome.json` |
| Server implementation files declare no `interface`/`type`; each lives in its contract | Backend | Mechanical | Validation guard | Report-only: `bun run validate:server-types` ([#1180](https://github.com/tiagoluizpoli/church/issues/1180)); fails in `lint` after [#1191](https://github.com/tiagoluizpoli/church/issues/1191) |
| Every list query ends in a total `ORDER BY`; a read whose order is unused says why | Backend | Mechanical | Validation guard | Enforced: `bun run validate:list-order`, part of `lint` and `validate:affected` ([#1231](https://github.com/tiagoluizpoli/church/issues/1231)); whether the last key is unique stays with review |
| List filters, search and counts are applied in SQL, not in memory | Backend | Judgement | — | Review: an in-memory filter has many shapes |
| Server classes are built in `main/di/` and injected, never `new`-ed inside another class | Backend | Mechanical | Validation guard | Follow-up [#1129](https://github.com/tiagoluizpoli/church/issues/1129) |
| Web interfaces get their own file when large or several | Frontend | Judgement | — | Review: "large" and whether a split makes sense are judgements |
| Shared packages hold only generic code; application code lives in `apps/server` | Constitution, backend | Judgement | — | Review: "application-specific" is a judgement about meaning |
| Only `apps/server` imports `@church/server`; clients use the orval functions | Constitution | Mechanical | Biome rule | Enforced: root `noRestrictedImports` options in `biome.json` (also still bans the pre-scope bare `server` specifier), locked by `tooling/tests/biome/server-import-ban.test.ts`; `apps/fumadocs` is not covered because Biome does not lint it. Relative imports: `packages/*` must name `apps/server`; the `apps/web`/`apps/desktop` override bans `../../server` and deeper. shortcut: a glob cannot see file depth, so a client root file (e.g. `vite.config.ts`) importing `../server` slips through and a future `server` folder two or more levels up inside a client would be flagged; move to a resolver-aware check if either happens |
| `@church/app-config` is plain data with a Zod schema, no logic beyond `withAllParkedOn` | Constitution | Judgement | — | Review: the package is one file; "no logic" is easier to read than to pattern-match |
| Every workspace name is scoped `@church/` | Constitution | Mechanical | Validation guard | Enforced: `bun run validate:workspace-scope` (every `apps/*` and `packages/*` `package.json`), part of `lint` |
| Documentation first: significant changes are planned in `planning/` | Constitution | Judgement | — | Review: "significant" is a judgement |
| A constitution amendment bumps its version | Constitution | Mechanical | Validation guard | Enforced: `bun run validate:constitution-version`, part of `lint` and `validate:affected` |
| A constitution amendment updates its dependent templates | Constitution | Judgement | — | Review: which templates depend on a change is a judgement |
| `mise.toml` and `packageManager` pin the same Bun | Tooling | Mechanical | Validation guard | Enforced: `bun run validate:bun-version`, part of `lint` and `validate:affected` |
| Run commands through root Bun scripts | Tooling | Judgement | — | Review: governs how an agent works, leaves nothing in the repository to check |
| Tests live in the owning project's `tests/` and import by alias | Tooling | Mechanical | Validation guard | Enforced: `bun run validate:test-placement`, part of `lint` |
| User-facing copy comes from the `@church/i18n` catalog, never a literal | Spec #837, ADR-0010 | Mechanical | Validation guard | Enforced: `bun run validate:presentation-text`, part of `lint` and `validate:affected`. Copy reached only through calls or unrelated names stays with review (see Presentation text) |
| Seed-relevant changes carry a seed decision | Tooling, ADR-0006 | Mechanical | Validation guard | Enforced: `tooling/validation/seed-impact.ts` in `validate:affected` |
| A `Seed-Impact` acknowledgement comes from the branch's own commits | Spec #1161 | Mechanical | Validation guard | Enforced: `tooling/validation/seed-acknowledgements.ts` in `validate:affected` |
| A CI step that runs tests records its output for the failed-tests summary | Spec #1161 | Mechanical | Validation guard | Enforced: `tooling/tests/ci/record-test-output.test.ts` (`test:validation`) |
| Annotations start their line through the gate's `[stage]` prefix and Playwright's `list` reporter | Spec #1161 | Mechanical | Validation guard | Enforced: `tooling/tests/validation/run-lanes.test.ts`, `apps/web/tests/fixtures/e2e-reporters.unit.test.ts` |
| Destructive database commands refuse any target but their own | Tooling, ADR-0005 | Mechanical | Validation guard | Enforced: runtime preflight of the database resolver |
| No generic `db:reset` script | ADR-0005 | Mechanical | Validation guard | Enforced: `tooling/tests/env/legacy-env-loading.test.ts` (`test:validation`) |
| The API client and `auto-generated-api.yaml` are generated, never hand-edited | Tooling | Mechanical | Validation guard | Enforced: `bun run validate:api-generated`, run by the `develop-fast` and `fast-gate` CI jobs |
| Fix lint, format and type errors; suppressions need user permission | Tooling | Judgement | — | Review: whether permission was given is not in the code; VII and date-time suppressions have their own guards |
| Finish the phase, run focused tests and affected validation before review | Tooling | Judgement | — | Review: a working process |
| Server classes get config as the constructor's `config` field; only `main/di/`, scripts and seeds import `@church/app-config`; domain functions never read config | Backend | Mechanical | Grit plugin | Enforced: `tooling/biome/no-app-config-import.grit` bans `@church/app-config` value imports and re-exports in server `src` outside `main/di/` and `scripts/`; "domain functions never read config" is enforced only through that import ban |
| A class copies the config values it uses into `private readonly` fields and does not keep `config` | Backend | Mechanical | Grit plugin | Enforced: `tooling/biome/no-whole-config.grit` |
| Tenancy is enforced with `church_id` | Backend | Judgement | — | Review: whether a query must be church-scoped depends on the data |
| Credential-sensitive and sensitive operations stay on the server | Backend, frontend | Judgement | — | Review: "sensitive" is a judgement |
| Web imports flow `shared → features → app` | Frontend | Mechanical | Biome rule | Enforced: `noRestrictedImports` overrides in `biome.json` |
| UI is built from shadcn components where one exists | Frontend | Judgement | — | Review: whether a component fits is a design call |
| The web reads `appConfig` by direct import | Frontend | Judgement | — | Review: states the allowed path; there is no fixed pattern to forbid |
| Parked UI is gated at the mount point, not with CSS | Frontend | Judgement | — | Review: hiding by CSS has many shapes |
| Component tests flip parked switches with `withAllParkedOn` | Frontend | Judgement | — | Review: a mock of `@church/app-config` may stub other values for other reasons |
| Component tests wait on UI state, not on a frame landing in time | Frontend | Judgement | — | Review: slow frames (`apps/web/tests/setup/slow-frames.ts`) make most such races fail, but not every delay-dependent one |
| Read `CONTEXT.md` and the relevant ADRs; use the glossary's terms; flag ADR conflicts | Domain | Judgement | — | Review: vocabulary and conflicts need meaning |
| Issues go through `gh`; triage roles map to the label table | Issue tracker, triage labels | Judgement | — | Review: agent workflow, leaves nothing in the repository to check |
| Guidance routes compose by scenario | Routing conformance | Judgement | — | Review: session behaviour, not repository content |
| Events are church-owned; per-ministry state lives on `MinistryParticipation` | ADR-0001 | Judgement | — | Review: domain model; the schema and types carry it |
| A `Shift` lies within its `TimeSlot`; requirements, assignments and availability attach to a `Shift` | ADR-0002 | Judgement | — | Review: domain invariant, held by domain code and its tests |
| Only `@church/time` imports `date-fns`/`date-fns-tz` | ADR-0003 | Mechanical | Biome rule | Enforced: `noRestrictedImports` in `biome.json` |
| No bare `new Date`, wall-clock accessors, `.toISOString()`, `toLocale*` or `Intl.DateTimeFormat` outside the seam | ADR-0003 | Mechanical | Grit plugin | Enforced: `tooling/biome/date-time-seam.grit`, with its fixture test |
| No `biome-ignore` of the seam rules; no `p`/`P` format tokens outside the seam | ADR-0003 | Mechanical | Validation guard | Enforced: `bun run validate:date-time-seam`, part of `lint` and `validate:affected` |
| CI runs under a non-UTC, non-Brazil `TZ` | ADR-0003 | Mechanical | Validation guard | Enforced: `TZ: Asia/Kolkata` in `.github/workflows/ci.yml` |
| The seam's format functions take no format string or options bag; `locale` only on word outputs | ADR-0003 | Mechanical | tsc setting | Enforced: the `@church/time` signatures, `bun run typecheck` |
| `useTimezone()` is the only source of the church timezone on the web | ADR-0003 | Judgement | — | Review: a timezone value can arrive in many shapes |
| `components/ui/calendar.tsx` is never hand-edited | ADR-0003 | Judgement | — | Review: a re-run of `shadcn add` changes it legitimately, and a tool cannot tell that from a hand edit |
| Playwright discovers only `*.spec.ts`; Vitest owns `*.test.ts(x)` | ADR-0004 | Mechanical | Validation guard | Enforced: `apps/web/tests/e2e-discovery-boundary.unit.test.ts` |
| A Playwright spec covers a critical journey | ADR-0004 | Judgement | — | Review: "critical journey" is a judgement |
| Every Playwright spec is listed exactly once in `ISOLATED_SPECS` | Tooling, ADR-0005 | Mechanical | Validation guard | Enforced: `bun run validate:e2e-lanes`, part of `lint` and `pre-commit`; the Playwright config load |
| Every Playwright spec has a `JOURNEY_MAP` or `CRITICAL_SMOKE_SPEC_PATHS` entry, and every entry points at an existing spec | ADR-0004 | Mechanical | Validation guard | Enforced: `bun run validate:journey-map`, part of `lint`, `validate:affected` and `pre-commit` ([#557](https://github.com/tiagoluizpoli/church/issues/557)) |
| Every `JOURNEY_MAP` prefix matches a production file | Tooling | Mechanical | Validation guard | Enforced: `bun run validate:journey-map`, part of `lint` and `validate:affected` |
| Skipping browser journeys needs a reason on the branch's own commits | Tooling | Mechanical | Validation guard | Enforced: `tooling/validation/journey-impact.ts` and `seed-acknowledgements.ts` in `validate:affected` |
| A `turbo.json` change narrows the gate only when it sits in one package's own task entries and that package has a test layer; anything else selects every workspace | Spec #1161 | Mechanical | Validation guard | Enforced: `readTurboNarrowing` in `validate:affected`, locked by `tooling/tests/validation/affected-turbo-narrowing.command.test.ts` |
| A failing E2E spec gets exactly one retry in CI | ADR-0004 | Mechanical | Validation guard | Enforced: `retries` in `apps/web/playwright.config.ts` |
| Daily and release gates; no direct pushes to `develop` or `master` | ADR-0004 | Mechanical | Validation guard | Enforced: `.github/workflows/ci.yml` and branch protection |
| Each worktree has its own databases, ports and URL set | ADR-0005 | Mechanical | Validation guard | Enforced: `env:local` and `db:bootstrap` generate them |
| Application seed data lives in `apps/server/seeds`, built from shared builders | ADR-0006 | Judgement | — | Review: "reusable construction" and "application-specific" need meaning |
| Every `SlotRequirement` names one Sector and one Role; eligibility is Role-only | ADR-0007 | Judgement | — | Review: domain model, held by the schema and domain code |
| Notifications reach Church Members through sinks; transactional emails go to addresses; the notifier core has no church concepts | ADR-0008 | Judgement | — | Review: "church concepts" covers names and fields, not only imports |
| `AuthorityService` is the only authorization gatekeeper; 401/403/404 by case | ADR-0009 | Judgement | — | Review: what counts as an inline check, and which status a case needs, are judgements |
| Mechanical rules fail `lint`; this inventory lists them | ADR-0010 | Judgement | — | Review: deciding whether a new rule is mechanical is itself a judgement |
