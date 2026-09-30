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
  uses, local Compose or elsewhere) and optional `RESEND_*`, live
  once in the ignored `church-shared.env` in the shared Git directory, which
  every worktree's `.env.local` copies; rerun `env:local` after editing it. It
  may override a default, never a generated key. Unleash itself runs outside
  local Compose; it needs the toggle `volunteer-dashboard-allow-overlap-save`
  (default disabled). Seed the file from the primary:
  `grep -E '^(UNLEASH_API_(URL|TOKEN)|RESEND_[A-Z_]+)=' .env > "$(git rev-parse --git-common-dir)/church-shared.env"`.
- **Primary checkout**: run `bun run worktree:bootstrap` once, explicitly.
  First remove the keys `env:local` warns about from `apps/server/.env`,
  especially `DATABASE_URL`: package value files beat the root `.env.local`.
  Its generated URL set and secret then override the legacy root `.env`
  (`church-develop.dev.home.arpa` URLs, see below; existing sessions are
  logged out), and pending migrations are applied to the live `church`
  database.

## Private worktree URLs

`env:local` puts each worktree's manual URL set (`BETTER_AUTH_URL`,
`VITE_SERVER_URL`, `CORS_ORIGIN`) on one private hostname and its assigned
ports (ADR-0005):

```text
http://church-<identity, _ as ->.dev.home.arpa:<CHURCH_WEB_PORT>     web
http://church-<identity, _ as ->.dev.home.arpa:<CHURCH_SERVER_PORT>  API
```

The primary checkout is `church-develop.dev.home.arpa` on ports 3101 (web)
and 3100 (API). Read a worktree's values from its `.env.local`. Each
worktree has its own hostname, so its session cookies stay separate.

Vite listens on every interface. It accepts `*.dev.home.arpa`, `localhost`,
and IP literals as `Host`, and refuses other names with 403. E2E and CI
never use these names: Playwright pins a `localhost` URL set on the
`PW_*` ports (`tooling/env/e2e-environment.ts`), whatever `.env.local`
says.

### One-time DNS setup

There is no reverse proxy, local certificate authority, or per-worktree DNS
entry. Two manual rules cover every worktree. Repository automation never
changes them.

1. **Wildcard record** in the home DNS resolver: answer `dev.home.arpa` and
   every name below it with the homelab server's Tailscale IPv4 address
   (`tailscale ip -4` on that server). Pick the form your resolver uses:
   - dnsmasq or Pi-hole (`/etc/dnsmasq.d/*.conf`):
     `address=/dev.home.arpa/<server-tailscale-ip>`
   - AdGuard Home (Filters → DNS rewrites): `*.dev.home.arpa` →
     `<server-tailscale-ip>`
2. **Tailscale split DNS**: in the admin console, go to DNS → Nameservers →
   Add nameserver → Custom. Enter the resolver's Tailscale IP, enable
   "Restrict to search domain", and enter `dev.home.arpa`. The resolver must be
   reachable over the tailnet: use its Tailscale IP, or a subnet route if
   it runs off-tailnet. MagicDNS is not required.

To check from any tailnet client, run
`tailscale dns query church-develop.dev.home.arpa` (Tailscale 1.76+) or
`dig +short church-develop.dev.home.arpa`. Both should print the server's
Tailscale IP.

Until #263 moves the development scripts onto Varlock, the server `dev`
script reads the legacy root `.env`, and Vite binds `PORT`. Neither uses the
assigned ports or this URL set yet.

### Recovery after replacing infrastructure

- **Homelab server replaced or re-joined to the tailnet** (new Tailscale
  IP): update the wildcard record's address.
- **Resolver replaced or moved**: recreate the wildcard record there, and
  point the split-DNS nameserver at its new Tailscale IP.
- **Tailnet recreated**: redo both steps.

No repository change or `env:local` rerun is needed: the hostnames do not
depend on IP addresses. If a client still gets stale answers, check its
DNS configuration with `tailscale dns status`.

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
step, and a removal that keeps its databases, leaves one diagnostic bundle
and prints its path. Bundles live in the shared Git directory
(`$(git rev-parse --git-common-dir)/church-failure-bundles/<time>-<command>-<worktree>-<suffix>/`),
so they outlive a removed worktree. Successful commands leave nothing.

- `bundle.json`: command, failed step, command line, timing, exit status
  (a removal that keeps its databases records the hook's 0), worktree
  identity and path, commit, execution purpose, assigned ports, and the
  worktree's three database targets as host, port, and name. `purpose` is
  the command's `CHURCH_EXEC_PURPOSE`: null for these lifecycle commands,
  which serve every purpose.
- `output.log`: the command's output, sanitized, then cut to its first 100
  and last 300 lines, each at most 1,000 characters.

Sanitizing (`tooling/diagnostics/sanitize.ts`) removes sensitive values
from every value file (`.env.local`, `.env`, package files,
`church-shared.env`), URL credentials, query strings and fragments, cookie,
authorization, and API-key headers, secret-named assignments, JSON fields,
and flags, JWTs, private keys, and email addresses. Bundles never copy value
files or the environment.

Recording a bundle deletes bundles older than 14 days; nothing else in the
directory is touched. `run-managed.ts` (`tooling/diagnostics/`) wraps the
managed scripts; a managed command nested in another only passes through,
so one failure yields one bundle.
`CHURCH_FAILURE_BUNDLES_DIR` redirects bundles elsewhere (tests, CI).

Finish the current implementation phase before review. Run targeted tests,
then affected validation, plus the relevant story E2E when one exists; review
the modified files and repair every finding in the same phase. Fix lint,
format, and type errors directly—suppression directives require explicit user
permission. Install Playwright's pinned Chromium with `bunx playwright install
chromium` when its executable is absent.
