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

| Environment | Pool | Dokploy prefix | Schedule | Dokploy Keep latest |
| --- | --- | --- | --- | --- |
| development | pre-deployment/reset | `development/pre-deployment` | disabled | unset |
| staging | pre-deployment/reset | `staging/pre-deployment` | disabled | unset |
| production | pre-deployment/reset | `production/pre-deployment` | disabled | unset |
| production | scheduled | `production/scheduled` | enabled, daily (e.g. `0 3 * * *`) | unset |

Development and staging have no scheduled cadence. Every backup's
**Database** is that environment's own database: `church_development`,
`church_staging` or `church_production`, each owned by the role of the same
name (see [deployment/README.md](../../deployment/README.md)). Pre-deployment and reset
backups share one pool.

### Five successful recovery points: `prune-backups.sh`

Dokploy writes each backup to `<bucket>/<postgres app name>/<prefix>/<timestamp>.sql.gz`.
Distinct prefixes give each environment and pool its own folder. Staging and
production share the VPS PostgreSQL service and its app name, so the prefix
is what separates them.

Dokploy's own **Keep latest** is not enough, so it stays **unset**. It keeps
the newest N file names whether or not each backup succeeded. A failed upload
deletes its partial object only on a best-effort basis
(`rclone deletefile … || true`). If storage drops during the upload, that
delete can fail too. The partial object then counts as one of the N, and the
next pruning run deletes a good recovery point in its place. Scheduled
backups prune the same way.

Instead, [`tooling/deployment/prune-backups.sh`](../../tooling/deployment/prune-backups.sh)
runs once a day on each Dokploy host and keeps the newest **five intact**
backups of each pool. An object is intact when it is a complete gzip stream.
Dokploy writes `pg_dump -Fc | gzip`, so a truncated or partial upload fails
gzip's integrity check (`gzip -t`). For each pool the script:

- keeps the newest five intact backups and deletes older intact ones;
- deletes an incomplete object only when a newer intact backup exists. The
  newest object may still be uploading, so it is never deleted while no newer
  intact backup exists;
- **fails closed**: if it cannot list the pool or fully read any object, it
  deletes nothing in that pool and exits non-zero. It never deletes an intact
  backup unless five newer intact ones exist. It ignores files that are not
  `*.sql.gz`;
- warns when a pool holds fewer than five intact backups.

What the guarantee covers: after each daily run, every pool holds its five
newest successful backups, or all of them while it has fewer. **Between
daily runs, an on-demand pool (pre-deployment/reset) may briefly hold more
than five**, because every `backup:create` adds one and nothing prunes it
until the next run. Pruning one pool never reaches another pool's,
environment's or database's files.

The commands still refuse Dokploy older than 0.30.0, because older versions
never clean up a failed backup's partial object. Never put other `*.sql.gz`
files in these folders. Never change an existing backup's prefix without
moving its files.

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
   Leave **Keep latest** empty. Note each backup id: it appears in the
   backup's API responses, for example in `postgres.one` under
   `backups[].backupId`.
6. **Daily prune on each Dokploy host** (homelab and VPS). Create a second
   access key, limited to the Church bucket, with list, read and delete. Keep
   it on the host only: it never goes into GitHub. Run
   `prune-backups.sh` daily, after the scheduled backup window (for example
   `0 5 * * *` when the scheduled backup runs at `0 3 * * *`), as a Dokploy
   server **Schedule** or a host cron job. It needs `rclone` and `gzip`, which
   the `rclone/rclone` image provides:

   ```sh
   docker run --rm \
     -v /etc/church/prune-backups.sh:/prune-backups.sh:ro \
     --env-file /etc/church/prune-backups.env \
     --entrypoint sh rclone/rclone:1.68.2 /prune-backups.sh \
     church:<bucket>/<postgres app name>/production/pre-deployment \
     church:<bucket>/<postgres app name>/production/scheduled \
     church:<bucket>/<postgres app name>/staging/pre-deployment
   ```

   Here `/etc/church/prune-backups.sh` is a copy of the repository's script.
   `prune-backups.env` (mode `0600`) defines the remote `church` with
   `RCLONE_CONFIG_CHURCH_TYPE=s3`, `…_PROVIDER`, `…_ENDPOINT` (the tailnet S3
   URL), `…_ACCESS_KEY_ID`, `…_SECRET_ACCESS_KEY` and `…_REGION`. On the
   homelab, list the development pool, `…/development/pre-deployment`. Send
   the job's non-zero exit and its output to the operator, for example
   through the Dokploy schedule's notification. Run it once by hand and check
   its `✔ … kept` lines before relying on it.
7. **Command configuration**, declared in `tooling/deployment/.env.schema`.
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
bun run backup:check -- --environment=production --database=church_production

# Before a deployment or reset. The protected operation runs only on exit 0:
bun run backup:create -- --environment=staging --database=church_staging
```

Both commands verify the following before they start anything:

- the Dokploy version;
- that the configured backup is a PostgreSQL database backup of exactly
  `--database`;
- the pool's prefix;
- that Dokploy's **Keep latest** is unset (prune-backups.sh keeps five intact
  backups instead);
- that its schedule is disabled. `check` also requires production's enabled
  daily scheduled pool, and refuses a scheduled pool anywhere else.

`check` also lists each pool through Dokploy (`backup.listBackupFiles`) and
refuses a pool that holds fewer than five backups. A new environment's check
therefore passes only once each pool holds five, and a failing check after
that means backups or the daily prune need attention.

`create` exits 0 only when Dokploy's synchronous
`backup.manualBackupPostgres` call returns success. That happens after the
dump and upload succeed. Nothing prunes the pool at that point; the next daily
prune does. Missing
configuration, a refused configuration, a failed backup and a request that
never completes (timeout, proxy 5xx) all exit non-zero. The request lasts as
long as the backup itself, so any proxy in front of Dokploy must allow that.

A failure prints only the Dokploy endpoint, the HTTP status and the backup
id, never Dokploy's response: a failed backup's error can quote the backup
command with the destination's S3 keys, which GitHub's log masking does not
know. Read the reason in that backup's log in Dokploy.

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
real environment database therefore restores as that environment's role
(`pg_restore --role=church_<environment>`, or connected as it) so the objects
belong to it, then reruns `db:provision:environment <environment>` from
[deployment/README.md](../../deployment/README.md) to reapply its database
ownership and CONNECT restriction.

## Application rollback is not database restoration

- **Application rollback** ([rollback.md](rollback.md)) redeploys a
  previously verified image set and leaves the database as it is. It refuses
  a target the current schema is not declared compatible with. It loses no
  data.
- **Database restoration** replaces the environment database with a backup.
  It is a deliberate, separate operator action. No workflow, rollback or
  deployment restores a database or reverses a migration.

## Database restoration

Restoring discards **every write made after the chosen backup**: sign-ups,
invitations, schedules, assignments, sessions and queued email created since
then are gone, and nothing merges them back. Use it only when the data itself
is wrong (a destructive migration, a bad reset, corruption) and fixing forward
or an application rollback cannot repair it. For production, agree the loss
window with the Church before starting.

1. **Choose the backup.** List the pool folders
   (`<environment>/pre-deployment`, and for production
   `production/scheduled`) and pick the newest file taken before the damage.
   Note its timestamp: the lost window is from then until now.
2. **Verify it in isolation first.** Restore that file into an empty,
   unconnected database (`church_restore_check`) on a non-production
   service, exactly as in the [restore exercise](#restore-exercise-before-the-production-launch).
   Check that it restores without errors, that its latest migration is the
   one you expect, and that the rows you need are there and the damage is
   not. Drop it afterwards. Do not continue if this fails.
3. **Stop writes.** Make sure no deployment, rollback or reset of the
   environment is running or queued (its `deploy-<environment>` workflow
   runs). In Dokploy, stop the environment's compose so `server` and its
   outbox worker no longer write.
4. **Back up the current state** with `backup:create`, even though it holds
   the damage. It is the only copy of the writes you are about to discard.
5. **Restore** the chosen file into the environment database, connected as
   or with `--role=church_<environment>` (see above), never another
   environment's database or dump. Then rerun
   `db:provision:environment <environment>` to reapply ownership and the
   CONNECT restriction.
6. **Match the application to the restored schema.** Compare
   `drizzle.__drizzle_migrations` with the journals of verified revisions.
   Start the compose only with images whose migrations are all in the
   restored ledger or newer and compatible; usually redeploy the revision
   that was running when the backup was taken, through
   [Roll Back](rollback.md) or a normal deployment (whose backup and
   `migrate` then run against the restored database).
7. **Verify** `/api/health` reports the expected revision and database `ok`,
   sign in, and check the data from step 2.
8. **Record** the backup file, the lost-data window, who approved it and
   the verification result on the incident issue.

A failed migration can leave earlier migrations of the same deployment
applied. Inspect the ledger and the Dokploy log before choosing between
fixing forward and restoring.
