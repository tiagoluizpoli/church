# Resetting development or staging

Ordinary deployments keep all data. A reset is a separate, explicit operator
action for the deployed **development** or **staging** environment. There are
two modes:

| Mode | Result |
| --- | --- |
| `clean` | a clean installation: no Churches, users or demo data. Set up the Platform Operator and provision Churches afterwards. |
| `demo` | the server-owned development seed (`apps/server/seeds/recipes/development.ts`), the same graph `db:reseed:dev` loads locally, anchored on today |

Production cannot be reset. Local and worktree databases keep using
`bun run db:reseed:dev` and its loopback/worktree protections. This command
refuses a `local` target.

## What survives and what is recreated

| Kept | Removed |
| --- | --- |
| `runtime_configuration` (`email_delivery_mode`) | every other `public` table: Churches, users, accounts, sessions, verifications, invitations, Ministries, schedules and the rest |
| the schema and migration history (`drizzle.__drizzle_migrations`); no migration runs | pending, processing and failed outbox email |
| Dokploy configuration: `DATABASE_URL`, `CHURCH_ENVIRONMENT`, secrets, domains, backups | every message captured in the environment's Mailpit |
| the database role and its grants | |

Identities are not kept. After `clean`, recreate them with `operator
setup-identity` and `operator provision-church` (see
[deployment/README.md](../../deployment/README.md#platform-operator-and-first-church)).
After `demo`, the seed's own personas exist. They share the seed persona
password from `apps/server/seeds/blueprints/credentials.ts`, which is in this
repository. Anyone who reaches staging can sign in as them, so use `demo` on
staging only for a demonstration, and use `clean` before real testers arrive.

## What the command checks before it deletes anything

In this order, and it stops at the first failure:

1. The mode is `demo` or `clean`. `--environment` is `development` or
   `staging` and equals the container's `CHURCH_ENVIRONMENT`.
2. The server is stopped: no connection named `church-server` (the deployed
   server's `PGAPPNAME`) is open to the database. A running server could
   still deliver an email it had already claimed after the reset.
3. Mailpit's API (`MAILPIT_API_URL`, set by `compose.mailpit.yml`) answers.
4. `bun run backup:create -- --environment=<env> --database=<current database>`
   exits 0 (see [backups.md](backups.md)). It needs `DOKPLOY_URL`,
   `DOKPLOY_API_KEY` and `CHURCH_BACKUP_ID`.

Then it empties the tables and, for `demo`, loads the seed. Both happen in one
transaction. It then verifies the demo graph. Captured messages are deleted
last, so mail captured before the reset is gone too.

## Procedure

Run these on the environment's host, in its Dokploy Compose project, with
the same files the deployment uses:

```sh
compose="docker compose -f compose.yml -f compose.mailpit.yml"

# 1. Stop the application. Mailpit and the database keep running.
$compose stop web server

# 2. Reset: clean (or demo) for staging (or development).
DOKPLOY_URL=… DOKPLOY_API_KEY=… CHURCH_BACKUP_ID=… \
$compose run --rm --no-deps \
  -e DOKPLOY_URL -e DOKPLOY_API_KEY -e CHURCH_BACKUP_ID \
  server bun run environment:reset clean --environment staging

# 3. Start the application again.
$compose start server web
```

`run` starts a one-off container from the `server` service, so it has that
environment's `DATABASE_URL`, `CHURCH_ENVIRONMENT` and `MAILPIT_API_URL`. Only
`✔ <environment> (<database>) reset to <mode>.` with exit 0 means success.

After `clean`, run `operator setup-identity` and then `operator
provision-church` for each Church, as in the deployment README.

## Failure recovery

| What failed | State | What to do |
| --- | --- | --- |
| a refusal, unreachable Mailpit or a failed backup (exit 1 before `Backing up` succeeds) | nothing changed | fix the cause (target, stopped server, Mailpit, backup prerequisites) and run it again |
| emptying or seeding (the transaction) | rolled back, the data is as before | read the error and run it again. A backup was already taken; that is harmless |
| demo verification after the seed | the seed is loaded but did not verify | run the reset again; if it keeps failing, use `clean` and report the seed problem |
| `Mailpit's captured messages were not deleted` | the database is reset, old captured mail remains | open the Mailpit inbox over Tailscale, choose **Delete all**, then start the application |
| the wrong mode, or the old data is needed again | the database is reset | restore the backup the reset just made (newest file under `<environment>/pre-deployment`) with [database restoration](backups.md#application-rollback-is-not-database-restoration), keeping the application stopped |

Start `server` and `web` again in every case once the database is in the state
you want. No reset of a deployed database is part of implementing this
command. Operators run it only when they need it.
