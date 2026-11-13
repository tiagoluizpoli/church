# Releases and staging

How a version becomes a release candidate on staging. Publishing a GitHub
release is what deploys; preparing a version never does. Production
promotion of a stable release is documented separately.

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

Rollout failures are listed in [deployments.md](deployments.md#when-it-fails).
