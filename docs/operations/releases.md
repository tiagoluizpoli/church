# Releases, staging and production

How a version becomes a release candidate on staging, and how a stable
release promotes that tested candidate to production. Publishing a GitHub
release is what deploys; preparing a version or merging into `master` never
does.

Nothing here configures live infrastructure. Set up staging first
([deployment/README.md](../../deployment/README.md), [backups.md](backups.md),
[email-delivery.md](../deployment/email-delivery.md)) and see
[deployments.md](deployments.md) for the shared rollout steps.

## Versions

The version lives in the root `package.json` (`version`, starting at
`0.0.0`). Prepare it on `develop`, from the repository root:

| Command | From | To |
| --- | --- | --- |
| `bun run version:rc -- <major\|minor\|patch>` | `1.2.3` | `2.0.0-rc.1` / `1.3.0-rc.1` / `1.2.4-rc.1` |
| `bun run version:rc` | `1.3.0-rc.1` | `1.3.0-rc.2` |
| `bun run version:stable` | `1.3.0-rc.2` | `1.3.0` |

The commands only rewrite `package.json`. They do not commit, tag, publish a
release or deploy. A level is refused while a candidate is open, and
`version:stable` is refused unless the current version is a candidate.

## Publishing a candidate

1. `bun run version:rc …`, commit (`chore(root): prepare v1.3.0-rc.1`) and
   merge `develop` into `master` through the usual release PR. The merge
   deploys nothing.
2. On GitHub, create a release with the new tag `v1.3.0-rc.1` targeting
   that `master` commit, tick **Set as a pre-release**, and **Publish**. A
   draft or a pushed tag alone deploys nothing.
3. `Deploy Release` ([deploy-release.yml](../../.github/workflows/deploy-release.yml))
   then:
   1. **routes** the release (`bun run deploy:release`). It refuses, and
      deploys nothing, unless the tag is `vX.Y.Z-rc.N` with the pre-release
      flag set (or `vX.Y.Z` without it), the tagged commit belongs to
      `master`, and that commit's `package.json` records the tag's version;
   2. **builds** `church-server` and `church-web` at the tagged commit,
      tagged with the release tag, and selects them by digest;
   3. **rolls out** to the `staging` GitHub Environment, one at a time
      (concurrency group `deploy-staging`, never cancelled): Dokploy target
      check, withdrawal of the candidate's old evidence, required backup of
      `church_staging`, migrations, Dokploy completion and health of the
      revision, exactly as in [deployments.md](deployments.md);
   4. **records evidence** only after that verification succeeds.

Re-running the workflow for the same release deploys the same commit again
with freshly built images and replaces the evidence. Any change to the
application needs a new candidate (`bun run version:rc`).

## Candidate evidence

A verified staging rollout attaches `staging-evidence.json` to the candidate's
GitHub release:

```json
{
  "schema": 1,
  "environment": "staging",
  "candidate": { "tag": "v1.3.0-rc.2", "version": "1.3.0-rc.2" },
  "revision": "<tagged commit>",
  "content": "<content identity>",
  "images": {
    "server": "ghcr.io/<owner>/church-server@sha256:…",
    "web": "ghcr.io/<owner>/church-web@sha256:…"
  },
  "rollout": {
    "status": "verified",
    "url": "https://staging.example.org",
    "dokployDeploymentId": "…",
    "run": "https://github.com/<owner>/<repo>/actions/runs/…"
  }
}
```

- The rollout deletes any earlier `staging-evidence.json` of that candidate
  before its backup, so a failed backup, migration, Dokploy deployment or
  health check leaves the candidate with no evidence.
- `content` is a SHA-256 over every tracked file at the revision, with only
  the root `package.json` `version` left out. Finalizing the candidate with
  `version:stable` keeps it, and any other change produces another identity.
- If staging verified but the upload failed, the job fails with
  `evidence was not published`. Re-run the workflow.
- Keep the release, its asset and the digests it names. Do not delete those
  ghcr.io image versions while the candidate may still be promoted.

## Promoting to production

Publishing the stable release **is** the approval. The `production` GitHub
Environment has no required reviewers or wait timer; do not add any.

1. When the newest candidate (say `v1.3.0-rc.2`) is verified on staging,
   `bun run version:stable`, commit (`chore(root): release v1.3.0`) and merge
   into `master`. The merge deploys nothing.
2. On GitHub, create a release with the new tag `v1.3.0` targeting that
   `master` commit, leave **Set as a pre-release** unticked, and **Publish**.
3. `Deploy Release` routes it exactly as for a candidate (stable tag, no
   pre-release flag, `master` commit, recorded version), then the
   `production` job runs `bun run deploy:promote`, one at a time
   (concurrency group `deploy-production`, never cancelled). It:
   1. takes the **newest** published `v1.3.0-rc.N` (drafts ignored) and reads
      its `staging-evidence.json`;
   2. refuses, before any backup or Dokploy change, unless that evidence is
      a `verified` staging rollout of that candidate with digest-pinned
      images, the candidate tag still points at the evidenced revision, and
      the evidence's `content` equals the stable release's content identity.
      Only the root `package.json` version may differ;
   3. builds **nothing**: it rolls out the evidenced image digests through
      the usual path ([deployments.md](deployments.md)): Dokploy target check
      (`CHURCH_ENVIRONMENT=production`), required backup of
      `church_production`, migrations, Dokploy completion and health of the
      **candidate's** revision.

The job summary reports the stable release, the promoted candidate and the
revision actually running. That revision is the candidate's commit (the
images were built there), not the stable release's version-bump commit.

`deploy:rollout` refuses `--environment=production`; promotion is the only
way to deploy production. A prerelease never reaches the `production` job.

### Production setup checklist

Production runs on the VPS with its own database `church_production`, role,
secrets and hostname, and no Mailpit (`compose.yml` only; email always goes
through Resend). The `production` GitHub Environment needs the same names as
staging, with production values: `DOKPLOY_URL`, `DOKPLOY_API_KEY` (secret),
`DOKPLOY_COMPOSE_ID`, `CHURCH_BACKUP_ID` (the `production/pre-deployment`
pool, [backups.md](backups.md)) and `PUBLIC_ORIGIN`. Run the restore exercise
in [backups.md](backups.md) before the first promotion.

### Retention

- Keep every candidate release and its `staging-evidence.json` until a later
  stable release supersedes it. Deleting the evidence makes the stable
  release unpromotable; publish another candidate instead.
- Keep the ghcr.io `church-server` and `church-web` versions named by the
  evidence of every candidate that may still be promoted, and of every
  `verified-<environment>` rollout you may [roll back](rollback.md) to. Production pulls them by digest;
  a pruned digest fails the Dokploy deployment, leaving the previous
  containers running.

## Staging setup checklist

Staging runs on the VPS with its own database `church_staging`, role,
secrets and hostname. Its application is public, but its data, captured
email and Mailpit inbox stay isolated (Mailpit is reachable only through
Tailscale). The `staging` GitHub Environment needs:

| Name | Kind | Value |
| --- | --- | --- |
| `DOKPLOY_URL` | variable | the VPS Dokploy URL |
| `DOKPLOY_API_KEY` | secret | Dokploy API key |
| `DOKPLOY_COMPOSE_ID` | variable | id of the staging Compose application |
| `CHURCH_BACKUP_ID` | variable | staging pre-deployment backup id ([backups.md](backups.md)) |
| `PUBLIC_ORIGIN` | variable | e.g. `https://church-staging.example.org` |

The Dokploy Compose application is configured like development's
([deployments.md](deployments.md#development-setup-checklist)), with
`CHURCH_ENVIRONMENT=staging` and the staging `DATABASE_URL`, secrets and
hostname. A compose with another `CHURCH_ENVIRONMENT` is refused before
anything changes.

## When it fails

| Message | Meaning | Next step |
| --- | --- | --- |
| `only a published release deploys` | not a `published` release event | publish the release |
| `is a draft` | the release is a draft | publish it |
| `is not vX.Y.Z or vX.Y.Z-rc.N` | malformed tag | delete the release and tag, publish a well-formed one |
| `needs prerelease=…` | pre-release flag and tag disagree | delete and republish with the right flag |
| `does not belong to master` | the tag points outside `master` | tag a `master` commit |
| `records version …` | the tagged `package.json` version differs from the tag | tag the commit that prepared that version |
| `evidence was not published` | staging verified, upload failed | re-run the workflow |
| `No published vX.Y.Z-rc.N candidate` | no candidate of that version | publish one, verify it on staging, then republish the stable release |
| `has no staging-evidence.json` / `was not verified on staging` | the newest candidate has no successful staging rollout | re-run its staging deployment, then re-run `Deploy Release` for the stable release |
| `does not describe a staging rollout` / `is not JSON` | the evidence was edited or replaced | re-run the candidate's staging deployment |
| `the application changed` | the stable commit differs from the candidate beyond its version | publish another candidate with that content |
| `now points at …` | the candidate tag moved after staging verified it | publish another candidate |
| `only by promoting` | a direct `deploy:rollout` to production | publish a stable release instead |

Rollout failures are listed in [deployments.md](deployments.md#when-it-fails).
