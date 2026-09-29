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
| Reset development DB | `bun run db:seed:reset` |
| Seed development users | `bun run db:seed:dev-users` |
| Generate worktree `.env.local` | `bun run env:local` |
| Revalidate its ports before launch | `bun run env:local -- --revalidate` |
| Create + migrate its dev/int/E2E databases | `bun run db:bootstrap` |
| Make a worktree ready (all of the above) | `bun run worktree:bootstrap` |

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
  the cause it printed, and rerun `bun run worktree:bootstrap`. Every step is
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
  (`localhost` URLs; existing sessions are logged out), and pending migrations
  are applied to the live `church` database. Sequence it with the private
  worktree naming work (#259).

Finish the current implementation phase before review. Run targeted tests,
then affected validation, plus the relevant story E2E when one exists; review
the modified files and repair every finding in the same phase. Fix lint,
format, and type errors directly—suppression directives require explicit user
permission. Install Playwright's pinned Chromium with `bunx playwright install
chromium` when its executable is absent.
