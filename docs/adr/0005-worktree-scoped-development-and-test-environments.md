# Worktree-Scoped Development and Test Environments

## Status

accepted

## Context

Environment loading currently depends on the runner and working directory:
server and database scripts load a root `.env`, web tooling may load
`apps/web/.env`, tests use a fallback database URL, and E2E seed and runtime
processes can select different databases. This has allowed destructive test
operations to reach the development database and caused cross-process failures
such as provisioning an invitation in one database and attempting redemption
in another. [Issue #203](https://github.com/tiagoluizpoli/church/issues/203)
defines the implementation scope and acceptance criteria.

Feature worktrees also share fixed ports and have no environment bootstrap or
database lifecycle. A fresh worktree therefore needs manual configuration and
cannot safely run beside another worktree.

## Decision

### Environment contracts

The supported local execution purposes are:

- `development`: uses the current worktree's development database.
- `unit`: has no database.
- `integration`: uses the current worktree's dedicated integration database.
- `e2e`: uses the current worktree's dedicated E2E database.

Database selection is explicit. `NODE_ENV` does not select a database, and
integration or E2E operations have no fallback URL.

Varlock owns environment-file precedence, purpose selection, primitive
validation, sensitive-value redaction, and injection into child processes.
The existing `@church/env` Zod contracts remain the application-facing typed
API and fail application startup when required configuration is absent or
invalid. A dedicated typed database resolver maps one explicit purpose to its
URL and enforces cross-variable safety invariants. Varlock does not replace
those application contracts in this change.

Each worktree has one ignored root `.env.local` containing its actual values.
Committed service-owned Varlock schemas for server, web, and database import
shared root definitions. Package scripts run through Varlock explicitly;
packages do not independently search for or load value files.

### Database topology and safety

One root development Compose project owns one long-lived PostgreSQL instance
on a fixed port. The primary `develop` worktree retains `church` as its
development database. Every feature worktree receives three readable,
collision-safe databases:

```text
church_<worktree>_dev
church_<worktree>_int
church_<worktree>_e2e
```

The primary worktree also receives dedicated integration and E2E databases.
The root Compose project is the only local infrastructure entrypoint; the stale
`packages/db/docker-compose.yml` is removed. Production and Dokploy Compose
configuration are outside this decision. One local Unleash instance remains
shared.

Every destructive command declares its purpose. `db:reset:dev` may reset only
the current worktree's development database. Integration and E2E setup and
cleanup may affect only their matching databases. There is no generic
`db:reset` alias.

Before a destructive operation, a preflight reports the purpose, worktree,
host, port, and database name with credentials redacted. The operation is
rejected unless the resolved URL differs from the configured development URL
when required and its database identity matches the requested purpose.

### Worktree lifecycle

Checked-in Worktrunk project hooks call one idempotent bootstrap operation when
a worktree is created. Under a shared allocation lock it:

1. installs dependencies from the frozen lockfile;
2. starts or verifies the shared PostgreSQL Compose service;
3. allocates the worktree's ports;
4. generates `.env.local` with a unique local Better Auth secret;
5. creates its three databases; and
6. applies migrations to all three databases.

Application data is not seeded automatically. The already-existing primary
worktree uses the same operation once through an explicit bootstrap command.
If bootstrap fails, its isolated configuration and databases remain available
for diagnosis; rerunning the idempotent operation resumes safely.

Feature-worktree removal attempts to terminate connections to and drop exactly
that worktree's three databases. If PostgreSQL is unavailable, removal
proceeds with a warning. A separate prune command compares the managed
database namespace with active Worktrunk worktrees, reports stale databases by
default, and deletes them only with `--apply`. It never considers `church` or
databases outside the managed namespace.

### Ports and manual browser access

The primary worktree keeps its established application ports. A feature
worktree derives deterministic starting ports from the repository, worktree,
and service, then linearly probes under the allocation lock until free ports
are found. The assigned ports are persisted. If a port is later occupied, the
launch operation reallocates the related web, server, CORS, and authentication
URL set atomically.

Manual development uses a direct, reusable hostname convention with no reverse
proxy or local certificate authority:

```text
<project>-<worktree>.dev.home.arpa:<assigned-port>
```

One wildcard rule in the existing DNS resolver maps `*.dev.home.arpa` to the
homelab server's Tailscale address, and one Tailscale split-DNS rule delegates
`dev.home.arpa` to that resolver. These are one-time manual infrastructure
steps and are documented rather than mutated by repository automation. Vite
accepts only the controlled development suffix.

Within a manual-development process set, `CORS_ORIGIN`, `BETTER_AUTH_URL`, and
`VITE_SERVER_URL` consistently use that worktree hostname and its assigned
ports. Automated E2E and CI consistently use loopback or runner-local URLs and
do not depend on home-network DNS.

### Test concurrency and failure evidence

Separate worktrees may run development servers concurrently. Local E2E is
globally serialized across this repository with a kernel-managed `flock` in
the shared Git directory because each run starts Fastify, Vite, Chromium, and
fixture processes. The kernel releases the lock after normal exit or a crash,
so no stale-lock cleanup is required. CI jobs use their own runners and do not
share this local lock.

E2E setup resets the dedicated E2E target before the next run. Failed E2E
database state is preserved for diagnosis; successful runs may clean normally,
and Worktrunk removal ultimately drops the database.

Only failures of managed environment, database, validation, integration, and
E2E operations create a diagnostic bundle. It contains command metadata,
redacted target identity, bounded sanitized output, and relevant test reports
or Playwright traces. It never contains `.env.local`, credentials, full
connection URLs, cookies, or authentication state. Local bundles live in
shared repository Git state and expire after 14 days. CI uploads failure
bundles with seven-day retention. The failing command prints the bundle path;
no general command-logging or diagnostic-index subsystem is introduced.

### CI

CI injects its explicit integration or E2E values directly into the process
environment. Varlock validates and passes them to the same application
contracts and database resolver used locally. CI does not generate `.env`
files, use local URL fallbacks, depend on Worktrunk hooks, or depend on
home-network DNS.

## Considered Options

- **Continue with dotenv and runner-specific files:** rejected because file
  discovery remains dependent on the current working directory and does not
  provide one validated process boundary.
- **Use direnv or mise for this change:** rejected because Varlock covers the
  required environment contract while Bun and Turbo already own tasks. Either
  tool would add another activation or task layer without owning worktree
  cleanup.
- **Replace `@church/env` with Varlock-generated types now:** rejected because
  retaining the established Zod API preserves fail-fast application contracts
  and avoids an unrelated consumer migration.
- **Share development or test databases between worktrees:** rejected because
  migrations, seeds, and destructive cleanup would remain cross-worktree
  hazards.
- **Run one PostgreSQL container per worktree:** rejected because logical
  databases provide the required isolation with substantially lower resource
  and port cost.
- **Use Caddy or Dokploy's Traefik for worktree URLs:** deferred. Direct DNS and
  assigned ports meet LAN/Tailscale access and cookie-isolation needs without
  making this repository own a homelab-wide development gateway.
- **Use public wildcard DNS:** rejected because private development should not
  depend on an external resolver or expose private addressing unnecessarily.
- **Allow concurrent local E2E runs:** rejected for the current host because
  separate Chromium and application stacks create avoidable memory pressure.

## Consequences

- Fresh worktrees become reproducible after one-time approval of the checked-in
  Worktrunk hooks; hook commands require reapproval when they change.
- Local database names visibly identify their owning worktree, and stale
  databases have an explicit, reviewable cleanup path.
- Manual browser access requires the documented one-time DNS and Tailscale
  configuration. No per-worktree DNS entry or client certificate is required.
- A worktree's ignored `.env.local` is generated state, not a source of truth.
  Committed schemas and lifecycle code define how to reproduce it.
- Production secrets, deployment configuration, and product behavior remain
  unchanged.
