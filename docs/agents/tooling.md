# Church Tooling

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
| Affected validation | `bun run validate:affected` |
| Final validation | `bun run validate` |
| Rebuild + seed this worktree's development DB | `bun run db:reseed:dev` (`-- --anchor=YYYY-MM-DD` to reproduce a day) |
| Reset development DB | `bun run db:seed:reset` |
| Seed development users | `bun run db:seed:dev-users` |
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
the destructive ones (`db:reset:dev`, `db:reseed:dev`, `db:seed:reset`,
`db:clean`) print a redacted preflight and refuse any database but this
worktree's development one. `db:generate` reads no values, so it is the
one database script outside Varlock. Nothing else loads value files: no
`--env-file`, no `dotenv`, and each package's `bunfig.toml` turns off Bun's
automatic `.env` loading. Unit tests read no values at all; the server's
unit project pins placeholders (`apps/server/vitest.config.ts`).

Use root Bun scripts by default. The focused-workspace exception is
`bunx turbo -F <workspace> <task> --only -- <test path>`. Generate the API
client only with `bun run api:generate`.

Local `test:e2e` runs hold one lock shared by every worktree: a second run
prints that it is waiting and starts nothing until the first ends (CI skips
the lock). A failed run keeps its E2E database state for inspection; the next
run resets it.

The server relies on its package TypeScript configuration; run server scripts
through their package scripts. In particular, server decorator metadata is not
available to root TypeScript execution. `apps/server/auto-generated-api.yaml`
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
  `UNLEASH_API_URL` and `UNLEASH_API_TOKEN` (whichever Unleash this machine
  uses, local Compose or elsewhere), optional `RESEND_*`, and optional
  `CHURCH_DEV_DOMAIN`/`CHURCH_DEV_ADDRESS` (see "Private worktree URLs"), live
  once in the ignored `church-shared.env` in the shared Git directory, which
  every worktree's `.env.local` copies; rerun `env:local` after editing it. It
  may override a default, never a generated key. Unleash itself runs outside
  local Compose; it needs the toggle `volunteer-dashboard-allow-overlap-save`
  (default disabled). Seed the file from the primary:
  `grep -E '^(UNLEASH_API_(URL|TOKEN)|RESEND_[A-Z_]+)=' .env > "$(git rev-parse --git-common-dir)/church-shared.env"`.
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

Finish the current implementation phase before review. Run targeted tests,
then affected validation, plus the relevant story E2E when one exists; review
the modified files and repair every finding in the same phase. Fix lint,
format, and type errors directly—suppression directives require explicit user
permission. Install Playwright's pinned Chromium with `bunx playwright install
chromium` when its executable is absent.
