# Church Tooling

Bun and Node versions are pinned in `mise.toml` (`mise install`); `packageManager`
in `package.json` must name the same Bun.

Run commands from the repository root through existing Bun scripts. Do not
invoke package tools directly: root scripts carry required environment, filters,
and task ordering.

| Intent | Command |
| --- | --- |
| Lint + format | `bun run lint:fix` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |
| Unit/component tests | `bun run test:unit` |
| Integration tests | `bun run test:integration` |
| Story E2E | `bun run test:e2e -- tests/[path].spec.ts` |
| Complete test suite | `bun run test` |
| Seed contracts (every recipe, refusals) | `bun run test:seeds` |
| Test placement guard | `bun run validate:test-placement` |
| Named-parameter guard (constitution VII) | `bun run validate:named-parameters` |
| Generated API guard (CI-only: rewrites the tree) | `bun run validate:api-generated` |
| Journey-map integrity guard | `bun run validate:journey-map` |
| Affected validation | `bun run validate:affected` |
| Final validation | `bun run validate` |
| Rebuild + seed this worktree's development DB | `bun run db:reseed:dev` (`-- --anchor=YYYY-MM-DD` to reproduce a day) |
| Generate worktree `.env.local` | `bun run env:local` |
| Revalidate its ports before launch | `bun run env:local -- --revalidate` |
| Create + migrate its dev/int/E2E databases | `bun run db:bootstrap` |
| Make a worktree ready (all of the above) | `bun run worktree:bootstrap` |
| Report databases of removed worktrees | `bun run db:prune` (`-- --apply` drops them) |
| Start / stop this machine's opt-in URL resolver | `bun run dns:start` / `bun run dns:stop` |

`validate` and `validate:affected` run lint → typecheck → unit tests
concurrently with integration tests, then E2E only if both lanes pass. Output
lines carry a `[stage]` prefix and a final table reports each stage's status.

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

## Journey map

`bun run validate:journey-map` (`tooling/validation/journey-map-guard.ts`)
discovers every `.spec.ts` file under `apps/web/tests/`, recursively, and
fails unless each one is referenced by `JOURNEY_MAP` or
`CRITICAL_SMOKE_SPEC_PATHS` in `tooling/validation/journey-map.ts`, and each
reference in either list names a discovered spec. Paths are web-root-relative
with the `tests/` prefix. It lists unmapped specs, then stale references, so a
rename shows both halves; repeated references and overlap between the lists
are fine. It needs no browser, database or running application. Whether a
mapping's source prefix is accurate stays a review decision
([ADR-0004](../adr/0004-test-strategy-and-ci-gate-policy.md)).

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

`--dry-run` only reports the missing decision; the validating run fails.
The rules live in `tooling/validation/seed-impact.ts`. A deleted file keeps
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
bunx turbo -F server test:unit --only -- tests/api/auth/active-church-pre-validation.test.ts
```

`-F` takes the package name (`server`, `web`, `@church/core`, …); the task is
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

In the next multi-ticket run, record per ticket the affected-gate run count,
the reason for each rerun, the final outcome, and any waiting failures (sleep
guard, unsupported monitor calls), and report them as follow-up evidence for
[#580](https://github.com/tiagoluizpoli/church/issues/580).

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
| V. Biome lints and formats; it passes before every commit | Constitution | Mechanical | Biome rule | Enforced: Lefthook `pre-commit` runs Biome on staged files; `lint` in CI |
| V. Conventional commits | Constitution | Mechanical | Validation guard | Enforced: commitlint in Lefthook `commit-msg` |
| Atomic commits are small and focused | Constitution | Judgement | — | Review: "focused" is a judgement about intent |
| VI. Specifications traverse `specifications-list.md` | Constitution | Judgement | — | Review: a planning process, not repository content |
| VII. Named object parameters: at most one parameter, named `interface`/`type` shapes, no inline object types | Constitution, backend, ADR-0010 | Mechanical | Validation guard | Enforced: `bun run validate:named-parameters`, part of `lint` ([#539](https://github.com/tiagoluizpoli/church/issues/539), turned on by [#547](https://github.com/tiagoluizpoli/church/issues/547)) |
| Business logic is separated from framework code | Constitution, backend | Judgement | — | Review: what counts as business logic is a judgement; the import shape is the row below |
| Server layers import inward only (`api`/`application`/`infrastructure` → `domain`) | Backend | Mechanical | Biome rule | Enforced: `noRestrictedImports` overrides in `biome.json` |
| Shared packages hold only generic code; application code lives in `apps/server` | Constitution, backend | Judgement | — | Review: "application-specific" is a judgement about meaning |
| Only `apps/server` imports `@church/server`; clients use the orval functions | Constitution | Mechanical | Biome rule | Enforced: root `noRestrictedImports` options in `biome.json` (also bans the bare `server` name until [#549](https://github.com/tiagoluizpoli/church/issues/549)), locked by `tooling/tests/biome/server-import-ban.test.ts`; `apps/fumadocs` is not covered because Biome does not lint it. Relative imports: `packages/*` must name `apps/server`; the `apps/web`/`apps/desktop` override bans `../../server` and deeper. shortcut: a glob cannot see file depth, so a client root file (e.g. `vite.config.ts`) importing `../server` slips through and a future `server` folder two or more levels up inside a client would be flagged; move to a resolver-aware check if either happens |
| `@church/app-config` is plain data with a Zod schema, no logic beyond `withAllParkedOn` | Constitution | Judgement | — | Review: the package is one file; "no logic" is easier to read than to pattern-match |
| Every workspace name is scoped `@church/` | Constitution | Mechanical | Validation guard | Follow-up [#549](https://github.com/tiagoluizpoli/church/issues/549) |
| Documentation first: significant changes are planned in `planning/` | Constitution | Judgement | — | Review: "significant" is a judgement |
| A constitution amendment bumps its version | Constitution | Mechanical | Validation guard | Follow-up [#550](https://github.com/tiagoluizpoli/church/issues/550) |
| A constitution amendment updates its dependent templates | Constitution | Judgement | — | Review: which templates depend on a change is a judgement |
| `mise.toml` and `packageManager` pin the same Bun | Tooling | Mechanical | Validation guard | Follow-up [#551](https://github.com/tiagoluizpoli/church/issues/551) |
| Run commands through root Bun scripts | Tooling | Judgement | — | Review: governs how an agent works, leaves nothing in the repository to check |
| Tests live in the owning project's `tests/` and import by alias | Tooling | Mechanical | Validation guard | Enforced: `bun run validate:test-placement`, part of `lint` |
| Seed-relevant changes carry a seed decision | Tooling, ADR-0006 | Mechanical | Validation guard | Enforced: `tooling/validation/seed-impact.ts` in `validate:affected` |
| Destructive database commands refuse any target but their own | Tooling, ADR-0005 | Mechanical | Validation guard | Enforced: runtime preflight of the database resolver |
| No generic `db:reset` script | ADR-0005 | Mechanical | Validation guard | Follow-up [#552](https://github.com/tiagoluizpoli/church/issues/552) |
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
| Read `CONTEXT.md` and the relevant ADRs; use the glossary's terms; flag ADR conflicts | Domain | Judgement | — | Review: vocabulary and conflicts need meaning |
| Issues go through `gh`; triage roles map to the label table | Issue tracker, triage labels | Judgement | — | Review: agent workflow, leaves nothing in the repository to check |
| Guidance routes compose by scenario | Routing conformance | Judgement | — | Review: session behaviour, not repository content |
| Events are church-owned; per-ministry state lives on `MinistryParticipation` | ADR-0001 | Judgement | — | Review: domain model; the schema and types carry it |
| A `Shift` lies within its `TimeSlot`; requirements, assignments and availability attach to a `Shift` | ADR-0002 | Judgement | — | Review: domain invariant, held by domain code and its tests |
| Only `@church/time` imports `date-fns`/`date-fns-tz` | ADR-0003 | Mechanical | Biome rule | Enforced: `noRestrictedImports` in `biome.json` |
| No bare `new Date`, wall-clock accessors, `.toISOString()`, `toLocale*` or `Intl.DateTimeFormat` outside the seam | ADR-0003 | Mechanical | Grit plugin | Enforced: `tooling/biome/date-time-seam.grit`, with its fixture test |
| No `biome-ignore` of the seam rules; no `p`/`P` format tokens outside the seam | ADR-0003 | Mechanical | Validation guard | Enforced: `bun run validate:date-time-seam` (`test:validation`) |
| CI runs under a non-UTC, non-Brazil `TZ` | ADR-0003 | Mechanical | Validation guard | Enforced: `TZ: Asia/Kolkata` in `.github/workflows/ci.yml` |
| The seam's format functions take no format string or options bag; `locale` only on word outputs | ADR-0003 | Mechanical | tsc setting | Enforced: the `@church/time` signatures, `bun run typecheck` |
| `useTimezone()` is the only source of the church timezone on the web | ADR-0003 | Judgement | — | Review: a timezone value can arrive in many shapes |
| `components/ui/calendar.tsx` is never hand-edited | ADR-0003 | Judgement | — | Review: a re-run of `shadcn add` changes it legitimately, and a tool cannot tell that from a hand edit |
| Playwright discovers only `*.spec.ts`; Vitest owns `*.test.ts(x)` | ADR-0004 | Mechanical | Validation guard | Enforced: `apps/web/tests/e2e-discovery-boundary.unit.test.ts` |
| A Playwright spec covers a critical journey | ADR-0004 | Judgement | — | Review: "critical journey" is a judgement |
| Every Playwright spec has a `JOURNEY_MAP` entry, and every entry points at an existing spec | ADR-0004 | Mechanical | Validation guard | Follow-up [#557](https://github.com/tiagoluizpoli/church/issues/557) |
| A failing E2E spec gets exactly one retry in CI | ADR-0004 | Mechanical | Validation guard | Enforced: `retries` in `apps/web/playwright.config.ts` |
| Daily and release gates; no direct pushes to `develop` or `master` | ADR-0004 | Mechanical | Validation guard | Enforced: `.github/workflows/ci.yml` and branch protection |
| Each worktree has its own databases, ports and URL set | ADR-0005 | Mechanical | Validation guard | Enforced: `env:local` and `db:bootstrap` generate them |
| Application seed data lives in `apps/server/seeds`, built from shared builders | ADR-0006 | Judgement | — | Review: "reusable construction" and "application-specific" need meaning |
| Every `SlotRequirement` names one Sector and one Role; eligibility is Role-only | ADR-0007 | Judgement | — | Review: domain model, held by the schema and domain code |
| Notifications reach Church Members through sinks; transactional emails go to addresses; the notifier core has no church concepts | ADR-0008 | Judgement | — | Review: "church concepts" covers names and fields, not only imports |
| `AuthorityService` is the only authorization gatekeeper; 401/403/404 by case | ADR-0009 | Judgement | — | Review: what counts as an inline check, and which status a case needs, are judgements |
| Mechanical rules fail `lint`; this inventory lists them | ADR-0010 | Judgement | — | Review: deciding whether a new rule is mechanical is itself a judgement |
