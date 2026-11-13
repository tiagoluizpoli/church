# Application rollback

Rollback redeploys the images of an earlier **verified** rollout of an
environment, without rebuilding and without changing the database's schema or
data. It is the recovery for a bad application release. It is not database
restoration: a migration's effects and every write since stay in place. For
that, see [database restoration](backups.md#database-restoration).

The [Roll Back](../../.github/workflows/rollback.yml) workflow runs
`bun run deploy:rollback` (`tooling/deployment/deploy.ts rollback`). Nothing in
this repository has rolled back, or deployed, a live environment.

## Rollback targets

Every rollout that passes its health verification (development push, staging
candidate, production promotion, or a rollback itself) records a GitHub
deployment in the environment `verified-<environment>` with task
`church:verified-rollout`. Its payload holds the revision, the two image
digests, the URL, the Dokploy deployment id and the workflow run. Only these
records are rollback targets. A revision that never passed verification in
that environment is refused as unknown, and so is a record that does not name
immutable `image@sha256:` digests.

List an environment's targets, newest first:

```sh
gh api "repos/{owner}/{repo}/deployments?environment=verified-production&task=church:verified-rollout" \
  --jq '.[] | [.created_at, .sha, .payload.images.server] | @tsv'
```

Keep these records and the `ghcr.io` image versions they name for as long as
you may roll back to them. A pruned digest fails the Dokploy deployment and
leaves the current containers running.

## Schema compatibility

The database keeps every migration any deployed revision applied. The command
reads which revisions the environment's Dokploy compose deployed (from its
deployment history, any status, since a failed deployment may still have
migrated) and compares their migration journals with the target's:

- the target knows a migration none of them knew: refused, since its
  `migrate` service would migrate the database forward. Deploy it normally;
- the database may hold migrations the target predates: refused unless each
  one's SQL file declares `-- rollback-compatible: <reason>`. Authors add that
  line only when the previous application runs against the new schema (see
  [backend guidance](../agents/backend.md#rollback-compatible-migrations));
- Dokploy names no revision, or a revision is missing from the checkout:
  refused, since the current schema is then unknown.

When the target passes, its own `migrate` service still runs and finds nothing
pending. No down-migration exists or runs.

What the check cannot see: a deployment made by hand in Dokploy without the
`revision <sha>` description, or one Dokploy has pruned from its history. If
you deployed outside the workflows, or Dokploy keeps only a few deployments,
compare `select created_at from drizzle.__drizzle_migrations order by created_at`
on the database with the target's `packages/db/src/migrations/meta/_journal.json`
(`when` values) before rolling back.

Migrations before this ticket carry no marker, so rolling back across one of
them is refused. No environment had been deployed when that rule was added.

## Running it

GitHub → Actions → **Roll Back** → Run workflow, choosing the environment and
the full target revision, or:

```sh
gh workflow run rollback.yml -f environment=staging -f revision=<full sha>
```

The job runs in that environment's GitHub Environment and its concurrency
group `deploy-<environment>`: it waits for, and never overlaps, a deployment
or reset of the same environment, and a newer run never cancels it. It then:

1. renders the target revision's own `deployment/compose.yml` (plus
   `compose.mailpit.yml` outside production);
2. finds the newest verified record of the revision and checks schema
   compatibility. Refusals happen here, before anything changes;
3. refuses a Dokploy compose that is not **Raw**, is configured for another
   `CHURCH_ENVIRONMENT`, or still has a deployment running (for example after
   a timed-out job), so migrations never overlap;
4. takes the required pre-deployment backup. A failed backup stops here;
5. writes the recorded digests and deploys through Dokploy (`rollback to
   revision <sha>`), waits for Dokploy to report **done**, then waits until
   `revision.txt` and `/api/health` both serve the target revision with the
   database `ok`. Success is reported only then, with the URL, revision and
   digests in the job summary, and the rollback is recorded as a verified
   rollout of the revision.

The run needs the same Environment variables and secret as a deployment of
that environment ([deployments.md](deployments.md#development-setup-checklist),
[releases.md](releases.md#staging-setup-checklist)).

Rolling staging back does not change which candidate a stable release
promotes: promotion still uses the newest candidate's `staging-evidence.json`.
To promote the older code, publish it as a new candidate.

## When it fails

| Message | Meaning | Next step |
| --- | --- | --- |
| `has no verified <environment> rollout` | the revision never passed verification there | pick a revision from the list above |
| `does not name its immutable images` | the record was not written by a rollout | pick another record |
| `deploy it forward instead` | the target has migrations the database never received | deploy it through its normal workflow |
| `do not declare "-- rollback-compatible:"` | the database may hold migrations the target cannot run against | fix forward, or restore the database ([backups.md](backups.md#database-restoration)) |
| `current schema is unknown` / `cannot be read` | Dokploy history is empty or names an unknown revision | compare the ledger by hand as above; fix forward if unsure |
| `is still running` | an earlier Dokploy deployment has not finished | wait for it in Dokploy, then re-run |
| others | as for a deployment | see [deployments.md](deployments.md#when-it-fails) |

## First-launch acceptance checklist

The repository supplies the support above. This list is the separate
infrastructure acceptance step, done on the real hosts before the first
production promotion and recorded (date, who, result) on the release issue.
None of it has been done.

- [ ] **Dokploy capability**: each instance reports 0.30.0 or later
  (`backup:check` verifies it); Compose applications are **Raw** with
  auto-deploy off; `compose.one`, `compose.update`, `compose.deploy`,
  `deployment.allByCompose` and `backup.manualBackupPostgres` answer with the
  configured API key.
- [ ] **Database-role isolation per host**: `church_development` on the
  homelab, and `church_staging`/`church_production` on the VPS, each provisioned
  with `db:provision:environment` ([deployment/README.md](../../deployment/README.md));
  each role is refused `CONNECT` to the other environment's database.
- [ ] **Tailscale and homelab S3**: the VPS reaches the homelab S3 endpoint
  over the tailnet, and each Dokploy destination passes **Test connection**.
- [ ] **Independent retention**: every pool in
  [backups.md](backups.md#recovery-pools) exists with its own prefix and an
  unset Keep latest; `prune-backups.sh` runs daily on each Dokploy host and
  its manual run reports every pool; `backup:check` passes per environment,
  including production's daily scheduled pool, once each pool holds five; a
  deliberately failed backup removes no older file.
- [ ] **Restore exercise** in [backups.md](backups.md#restore-exercise-before-the-production-launch)
  completed into an isolated database and recorded.
- [ ] **Domains and secrets**: each environment's hostname routes to service
  `web` on port `8080` over HTTPS; the GitHub Environment variables and the
  Dokploy compose environment hold that environment's secrets only; Mailpit
  answers only over Tailscale.
- [ ] **Failure drills on a non-production environment**: a failed backup,
  failed migration and unhealthy rollout each stop without reporting success,
  and a rollback refuses an unverified revision.
- [ ] **Rollback drill on staging**: roll staging back to its previous
  verified candidate, confirm the job summary and `/api/health` revision, then
  deploy forward again.
- [ ] **Explicit initial provisioning**: after the first production
  deployment, the Platform Operator setup and Church provisioning commands
  ([deployment/README.md](../../deployment/README.md)) create the first
  Church and ChurchAdmin invitation, and the invitation is redeemed through
  the application. No deployment seeds data.
