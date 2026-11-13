# Deployments

How a revision reaches a deployed environment. Development is automatic:
every push to `develop` that passes CI deploys to the homelab
([deploy-development.yml](../../.github/workflows/deploy-development.yml)).
Staging follows published release candidates, and a published stable
release promotes the verified candidate to production
([releases.md](releases.md)).

Nothing here configures live infrastructure. Set up the environment first
([deployment/README.md](../../deployment/README.md),
[backups.md](backups.md), [email-delivery.md](../deployment/email-delivery.md)).

## What a develop push does

1. **CI** runs its `Fast Gate` job on the pushed revision (`ci.yml`).
2. **Required checks** (`bun run deploy:checks`) wait for `Fast Gate` on that
   revision. A failed check fails the workflow and nothing deploys. If
   `develop` has already moved past the revision, it is skipped as obsolete
   and the newer push deploys instead.
3. **Images** are built at the revision (`APP_REVISION` = its SHA), pushed to
   `ghcr.io/<owner>/church-server` and `church-web`, and selected by digest
   (`image@sha256:…`), never by tag.
4. **Rollout** (`bun run deploy:rollout`), in the `development` GitHub
   Environment, one at a time (concurrency group `deploy-development`):
   1. refuses a Dokploy compose that is not source type **Raw**, whose
      `CHURCH_ENVIRONMENT` is not `development`, or whose `DATABASE_URL` does
      not connect as role `church_development` to database
      `church_development` (a URL copied from another environment);
   2. takes the required pre-deployment backup (`backup.ts create`). A failed
      backup stops here;
   3. writes the revision's compose file (`compose.yml` +
      `compose.mailpit.yml`) and the two digests (`SERVER_IMAGE`,
      `WEB_IMAGE`) to the Dokploy compose, keeping its other variables;
   4. asks Dokploy to deploy, then waits until Dokploy reports the
      deployment **done**. Acceptance alone is not success. In the compose,
      `migrate` runs the migration preflights and then pending migrations
      once, before the new `server` starts. A failed preflight or migration
      fails the Dokploy deployment, and the previous containers keep
      running;
   5. waits until `<PUBLIC_ORIGIN>/revision.txt` and `/api/health` both
      report the revision and the API reports its database `ok`. A still
      healthy old container does not count;
   6. reports the URL, revision and both digests in the log and the job
      summary, and records them as a GitHub deployment in
      `verified-development`, the list [rollback](rollback.md) picks from.
      The GitHub deployment for the revision succeeds only then.

   Before the backup it also refuses while an earlier Dokploy deployment of
   the compose is still running, for example after a timed-out job.

No step seeds, provisions a Church, creates users or deletes data.

## Serialization and cancellation

Deployments, migrations and rollbacks for one environment share the
concurrency group `deploy-<environment>`. A newer push never cancels a
running deployment. It replaces only a deployment still waiting in the queue,
which is how obsolete development revisions are skipped.

Do not cancel a running deploy job, and never cancel the Dokploy deployment
itself. Cancelling the job does not stop Dokploy, which keeps migrating and
starting containers without the health verification. If a job was cancelled
anyway, check the Dokploy deployment log and `/api/health`, then push again or
re-run the workflow.

## Migrations

- Prefer schema changes the previous application version still runs against,
  such as adding nullable columns or tables first and removing old ones in a
  later release, and mark them `-- rollback-compatible: <why>`.
  [Rollback](rollback.md) redeploys earlier images without undoing
  migrations, and refuses to cross a deployed migration without that mark.
- Never edit an applied migration. A migration that needs a data check
  before it runs gets a read-only preflight in
  `packages/db/src/deployment-preflight.ts`, which runs only while that
  migration is pending. Today this covers `0028` (see
  [backend guidance](../agents/backend.md)). A collision stops the deployment
  before any migration runs. Fix the rows as that guidance says, then deploy
  again.

## Development setup checklist

The `development` GitHub Environment needs:

| Name | Kind | Value |
| --- | --- | --- |
| `DOKPLOY_URL` | variable | the homelab Dokploy URL |
| `DOKPLOY_API_KEY` | secret | Dokploy API key |
| `DOKPLOY_COMPOSE_ID` | variable | id of the development Compose application |
| `CHURCH_BACKUP_ID` | variable | development pre-deployment backup id ([backups.md](backups.md)) |
| `PUBLIC_ORIGIN` | variable | e.g. `https://church-dev.example.org` |

The Dokploy Compose application must use source type **Raw** with
auto-deploy off, Isolated Deployment on, and the domain routed to service
`web`, port `8080`. Its environment holds the runtime inputs from
[deployment/README.md](../../deployment/README.md), including
`CHURCH_ENVIRONMENT=development` and `MAILPIT_TAILSCALE_IP`. The deployment
overwrites `SERVER_IMAGE` and `WEB_IMAGE`. Dokploy also needs a registry
credential that can pull the private `ghcr.io` images.

A missing variable stops the rollout with its name before Dokploy is
touched.

## Running it by hand

From a checkout of the revision, with the variables above in the shell:

```sh
docker compose -f deployment/compose.yml -f deployment/compose.mailpit.yml \
  config --no-interpolate --no-normalize > /tmp/compose.yml
bun run deploy:rollout -- --environment=development --revision=<full sha> \
  --server-image=<image@sha256:…> --web-image=<image@sha256:…> \
  --compose-file=/tmp/compose.yml
```

Run it only when no workflow deployment for the environment is running.

## When it fails

| Message | Meaning | Next step |
| --- | --- | --- |
| `Required check "Fast Gate" concluded failure` | CI failed on the revision | fix and push |
| `Missing prerequisite: <NAME>` | an Environment variable or secret is not set | set it, re-run |
| `configured for CHURCH_ENVIRONMENT=…` / `must be "raw"` | wrong Dokploy target | fix `DOKPLOY_COMPOSE_ID` or the compose |
| `DATABASE_URL connects as role … to database …` | the compose points at another environment's database | set that environment's own `DATABASE_URL` (a literal URL, not a variable reference) |
| `… is still running; refusing to overlap its migrations` | an earlier Dokploy deployment has not finished | wait for it in Dokploy, then re-run |
| `Required backup … failed; nothing was deployed` | backup or its storage failed | see [backups.md](backups.md) |
| `rollout record was not saved` | verified, but recording the rollback target failed | re-run the workflow |
| `Dokploy deployment <id> ended error` | build, preflight, migration or startup failed; the previous containers still run | read that deployment's log in Dokploy |
| `did not report it finished` | Dokploy kept running past 30 minutes | inspect Dokploy before re-running |
| `did not become healthy on <sha>: …` | the public frontend or API serves another revision, or the API's database is unavailable | check routing, containers and the server log |
