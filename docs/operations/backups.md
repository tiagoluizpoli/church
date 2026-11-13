# Environment backups and restoration

Church backs up each environment database with Dokploy's native PostgreSQL
backups, stored on homelab S3-compatible storage reached over Tailscale.
`tooling/deployment/backup.ts` is the operator command that checks this
configuration and takes the backup that must succeed before a deployment or
reset. None of the infrastructure below exists until the separate
infrastructure step creates it. This repository supplies the command and this
runbook. It has configured nothing.

## Recovery pools

Each environment has two retention pools, and each pool is its own Dokploy
backup on that environment's PostgreSQL service:

| Environment | Pool | Dokploy prefix | Schedule | Keep latest |
| --- | --- | --- | --- | --- |
| development | pre-deployment/reset | `development/pre-deployment` | disabled | 5 |
| staging | pre-deployment/reset | `staging/pre-deployment` | disabled | 5 |
| production | pre-deployment/reset | `production/pre-deployment` | disabled | 5 |
| production | scheduled | `production/scheduled` | enabled, daily (e.g. `0 3 * * *`) | 5 |

Development and staging have no scheduled cadence. Every backup's
**Database** is that environment's own database. Pre-deployment and reset
backups share one pool.

### Why Dokploy's own retention is enough

Dokploy writes each backup to `<bucket>/<postgres app name>/<prefix>/<timestamp>.sql.gz`.
After a backup succeeds, **Keep latest** prunes only the `*.sql.gz` files
directly inside that backup's own folder, newest by storage time first. So:

- Distinct prefixes give each environment and pool its own folder. Staging and
  production share the VPS PostgreSQL service and its app name, so the prefix
  is what separates them.
- A failed backup stops before pruning runs. Since Dokploy **0.30.0**, the
  partial upload of a failed backup is also deleted. Older versions can leave
  that partial file behind, where it counts against retention. The command
  refuses Dokploy older than 0.30.0.
- Pruning one pool cannot reach another pool's files, another environment's
  files or another database's files.

Residual risk: Dokploy deletes the partial file on a best-effort basis. If
storage drops in the middle of an upload, that delete can fail too. After any
failed backup, list the pool's folder. If the newest object is much smaller
than the ones before it, delete that object before the next backup runs.
Never put other files in these folders. Never change an existing backup's
prefix without moving its files.

## Infrastructure inputs (separate setup step)

Verify each of these on the real hosts. Do not assume any of them:

1. **Dokploy**: version 0.30.0 or later on the homelab and the VPS
   (`GET /api/settings.getDokployVersion`).
2. **Tailscale**: the VPS and the homelab are in the same tailnet, and the VPS
   can reach the homelab S3 endpoint (`curl -I http://<homelab tailnet name>:<port>`
   from the VPS host, where the Dokploy backup container runs).
3. **S3 storage** on the homelab, for example MinIO or Garage: one bucket for
   Church backups, plus an access key limited to that bucket. Keep the
   endpoint private to the tailnet.
4. **Dokploy destination** on each Dokploy instance: provider, the tailnet
   endpoint URL, bucket, region, access key and secret key. Run **Test
   connection** before you continue.
5. **Dokploy backups**: create the backups in the table above on each
   environment's PostgreSQL service and select the destination from step 4.
   Note each backup id: it appears in the backup's API responses, for example
   in `postgres.one` under `backups[].backupId`.
6. **Command configuration**, declared in `tooling/deployment/.env.schema`.
   Set these per GitHub Environment, or in the operator's shell:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `DOKPLOY_URL` | variable | the Dokploy instance that hosts the environment |
   | `DOKPLOY_API_KEY` | secret | a Dokploy API key |
   | `CHURCH_BACKUP_ID` | variable | the environment's pre-deployment/reset backup id |
   | `CHURCH_SCHEDULED_BACKUP_ID` | variable | production only: the scheduled backup id |

## Commands

```sh
# After setup, and whenever the backup configuration changes:
bun run backup:check -- --environment=production --database=<production database>

# Before a deployment or reset. The protected operation runs only on exit 0:
bun run backup:create -- --environment=staging --database=<staging database>
```

Both commands verify the following before they start anything:

- the Dokploy version;
- that the configured backup is a PostgreSQL database backup of exactly
  `--database`;
- the pool's prefix;
- that it keeps 5;
- that its schedule is disabled. `check` also requires production's enabled
  daily scheduled pool, and refuses a scheduled pool anywhere else.

`create` exits 0 only when Dokploy's synchronous
`backup.manualBackupPostgres` call returns success. That happens after the
dump and upload succeed and Dokploy has pruned the pool. Missing
configuration, a refused configuration, a failed backup and a request that
never completes (timeout, proxy 5xx) all exit non-zero. The request lasts as
long as the backup itself, so any proxy in front of Dokploy must allow that.

## Restore exercise (before the production launch)

Run this once before the first production launch, and again after any change
to storage or Dokploy. It restores into an **isolated** database and never
touches a running environment.

1. Take a fresh production backup with `backup:create`, or wait for a
   scheduled backup. Write down the source's latest migration with
   `select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`
   and the row counts of a few core tables.
2. On a non-production PostgreSQL service, preferably the homelab one, create
   an empty database such as `church_restore_drill` and connect no
   application to it.
3. In Dokploy, open that service → Backups → **Restore**. Select the same
   destination and the newest file under `production/scheduled` (or
   `production/pre-deployment`), and enter `church_restore_drill` as the
   database name. Dokploy streams the file through `gunzip` into
   `pg_restore --clean --if-exists --no-owner`. You can do the same by hand
   with `rclone cat … | gunzip | pg_restore -d church_restore_drill -O --clean --if-exists`.
4. Compare the latest migration and the row counts with step 1. Record the
   date, the file name, how long the restore took and the result in the
   release notes or the issue.
5. Drop `church_restore_drill`.

The dumps carry no owners or grants (`--no-owner --no-acl`). Restoring over a
real environment database therefore also needs that environment's role grants
applied again.

## Application rollback is not database restoration

- **Application rollback** redeploys a previously successful image set and
  leaves the database as it is. This is safe only when the current schema is
  compatible with that application version. It loses no data.
- **Database restoration** replaces the environment database with a backup.
  Every write made after that backup is lost. It is a deliberate, separate
  operator action:
  1. stop the application;
  2. take a `backup:create` of the current state first;
  3. restore with the steps above, targeting the environment database;
  4. reapply the role grants;
  5. deploy an application version that matches the restored schema.

  No workflow restores a database automatically.
