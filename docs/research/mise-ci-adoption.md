# Research: Adopting mise in CI

Status: research only — no CI files changed. Recommendation: **skip for now** (see §4).

## 1. What mise is

mise (mise-en-place, formerly `rtx`) is a "development environment manager": a polyglot tool/runtime version manager, an environment-variable loader, and a task runner in one binary. Per the official docs it solves four problems: version management (install/pin per-project tool versions), environment configuration (env vars, dotenv files, secrets, Python venvs), task automation (named build/test/lint tasks with dependencies), and machine setup (host-level package/service declarations). Its stated philosophy is that features can be adopted independently, without migrating everything at once. Source: [mise.jdx.dev/about.html](https://mise.jdx.dev/about.html).

## 2. Fit with this repo's toolchain

**Bun support exists and is real.** mise has a built-in `bun` backend/plugin (no external plugin needed). A `mise.toml` entry looks like:

```toml
[tools]
bun = "latest"   # or a pinned version, e.g. "1.1.34"
```

mise also supports reading Bun's own idiomatic version files (`.bun-version`, or `package.json`'s `devEngines.bun` field), so it does not require inventing a new pinning convention. One caveat: running `bun upgrade` directly changes the installed binary without updating mise's recorded version — `mise upgrade bun` should be used instead. Source: [mise.jdx.dev/lang/bun.html](https://mise.jdx.dev/lang/bun.html).

**Value over `oven-sh/setup-bun@v2` for CI specifically: marginal.** `oven-sh/setup-bun@v2` already installs Bun in CI and *does* support pinning an exact version via its `bun-version` input (this repo currently sets it to `latest`, which is a choice made in this repo's action, not a limitation of `setup-bun`). mise would not add capability that `setup-bun` lacks for the CI job itself — both can pin an exact Bun version. mise's actual value-add here would be `mise.toml` becoming the **single source of truth for the Bun version in both CI and local dev**, via `jdx/mise-action`, rather than the version living only in the workflow YAML (`.github/actions/setup-church-ci/action.yml`) where local contributors never see it.

**Would a committed `mise.toml` help local dev + CI parity vs. floating `bun-version: latest`?** Yes, this is the one concrete, non-theoretical win: today `bun-version: latest` in `.github/actions/setup-church-ci/action.yml:11-13` means CI's Bun version can silently drift between runs (a new Bun release ships, next CI run picks it up with no diff in the repo), and local contributors have no repo-level record of which Bun version the project targets — they rely on whatever `bun` they happen to have installed. A committed `mise.toml` (or even just pinning `bun-version` in the existing action, no mise required) would fix the drift; mise additionally gives contributors one command (`mise install`) to get the exact same Bun version locally that CI uses.

## 3. Concrete shape of adoption

**a. `jdx/mise-action` minimal usage:**

```yaml
- uses: actions/checkout@v4
- uses: jdx/mise-action@v4
  with:
    version: 2026.3.10   # pin mise itself
    install: true
    cache: true
```

By default the action runs `mise install` (or `mise install --locked` automatically if a `mise.lock` is present), caches mise/tool downloads via GitHub's cache, adds mise's shims to `PATH`, and exports mise-managed env vars to subsequent steps. Inputs of note: `install_args`, `cache_key_prefix`, `working_directory` (useful in a monorepo to scope to a subproject), `env` / `export_path` (toggle env/PATH export). Source: [jdx/mise-action README](https://github.com/jdx/mise-action) (fetched via raw README, main branch, retrieved 2026-09-22).

mise's own CI guidance recommends committing a lockfile and using `mise install --locked` in CI for reproducibility, and using `mise exec -- <cmd>` / `mise run <task>` rather than shell activation. It also flags that the runner needs `curl`, CA certs, `tar`, and `sha256sum`/`shasum` available (true by default on `ubuntu-latest`), and that `MISE_SAFE=1` should be set when CI evaluates untrusted PR config (not applicable here since this repo runs its own configs). Source: [mise.jdx.dev/continuous-integration.html](https://mise.jdx.dev/continuous-integration.html).

**b. Minimal `mise.toml` sketch for this repo** (pinning Bun at minimum — this is illustrative only, not something this task writes to the repo):

```toml
[tools]
bun = "1.2.x"   # replace with the exact version this repo wants to pin

[env]
NODE_ENV = "development"   # example of a genuinely static, non-secret var
```

**c. Would mise's env var support subsume the `.env`-writing step in `setup-church-ci`? No — and doing so would conflict with the existing approach, not complement it.**

`setup-church-ci`'s "Create .env for test runner" step (`.github/actions/setup-church-ci/action.yml:26-37`) writes `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CORS_ORIGIN`, `UNLEASH_API_TOKEN`, etc. — values that are **job-scoped GitHub Actions env/secrets, different per job** (e.g. `church_test` vs `church_e2e` database, `VITE_SERVER_URL` only in the `e2e` job) and originate from the workflow's own `env:` blocks, not from static project config. mise's `[env]` table and dotenv loading (`env._.file`, or the `env_file` setting) are designed for **static, version-controlled, per-project configuration** (e.g., `NODE_ENV=development`), not for injecting values that differ per CI job/run or that come from GitHub Secrets. mise's docs explicitly separate this concern: it recommends marking genuinely sensitive values with `redact = true` for log masking (this does *not* encrypt or protect the value from a child process — see [mise.jdx.dev/environments/secrets/](https://mise.jdx.dev/environments/secrets/)), and separately advises that CI-specific settings be passed via the shell/CI environment before invoking mise rather than declared in `[env]`. Source: [mise.jdx.dev/environments.html](https://mise.jdx.dev/environments.html) / [mise.jdx.dev/configuration.html](https://mise.jdx.dev/configuration.html).

Concretely: replacing the current `.env`-writing step with mise env vars would mean either (a) hardcoding per-job secrets into a committed `mise.toml`, which is wrong for anything secret-shaped and wrong for per-job variation (test vs e2e DB), or (b) keeping the GitHub Actions `env:` blocks and *also* wiring mise to re-export them, which is pure duplication with no benefit. **This is a clear no — the two mechanisms address different concerns and should not be merged.**

## 4. Recommendation: skip for now

- **Is `bun-version: latest` an observed problem today, or theoretical?** Theoretical. Nothing in the CI history/context gathered indicates a Bun-version-drift incident has actually broken a build. The fix for the one real gap (no version parity between CI and local dev) is a one-line change to `oven-sh/setup-bun@v2`'s `bun-version` input (pin an exact version) — it does not require mise.
- **Complexity mise adds:** a new CLI (`mise`), a new config file (`mise.toml`) and lockfile (`mise.lock`) to maintain, a new GitHub Action dependency (`jdx/mise-action`) alongside the existing `oven-sh/setup-bun@v2`, and a second tool-version-pinning mechanism to keep in sync with `package.json`/CI if not fully migrated. For a repo that only needs to manage one runtime (Bun) — not Python + Node + Ruby + Terraform, the multi-language case mise is built for — this is meaningfully more machinery than the problem currently justifies.
- **CI caching interaction:** `mise-action`'s `cache: true` caches mise's own tool-install directory via GitHub's cache API, which would sit *alongside*, not replace, the existing `actions/cache@v4` step that caches `~/.bun/install/cache` keyed on `bun.lock` (`.github/actions/setup-church-ci/action.yml:15-20`). Adopting mise would not simplify caching — it would add a second cache to reason about, with its own key template mechanics.
- **Net:** mise is a good general answer to "multi-runtime version drift across CI and dev machines," but this repo currently manages exactly one runtime (Bun) via one already-adequate action (`oven-sh/setup-bun@v2`). The single concrete benefit identified — CI/local Bun version parity — is fully obtainable by pinning `bun-version` in the existing composite action, at zero added complexity. Adopting mise now would trade a one-line fix for a new toolchain dependency without a matching problem.

## 5. Scoped next step if this is revisited later

Not filing this as an issue now (per the "skip" recommendation above), but if Bun-version drift becomes an actual observed problem, or the repo grows to manage more than one runtime (e.g. adding Python tooling, or a Node version alongside Bun), the scoped task would be:

> **Title:** Pin Bun version in CI (no mise needed unless multi-runtime)
> **Scope:** Change `bun-version: latest` to an exact pinned version (e.g. `1.2.x` matching `package.json`'s `packageManager`/engines field if present) in `.github/actions/setup-church-ci/action.yml`. Document the pinned version's rationale in a comment. Re-evaluate mise only if/when a second runtime or language needs version management alongside Bun — at that point, re-open this research doc, add a `mise.toml` with `[tools] bun = "<pinned>"` (+ the new runtime), swap `oven-sh/setup-bun@v2` for `jdx/mise-action@v4` in `setup-church-ci`, and keep the existing `.env`-writing step and `actions/cache@v4` step unchanged (mise env vars must not touch job-scoped secrets/DB URLs — see §3c).
> **Out of scope:** any change to the `.env`-writing step, database migration step, or Playwright setup in `setup-church-ci`.
> **Verification:** CI green on `develop-gate`, `fast-gate`, `e2e`; `bun --version` in a CI log matches the pinned value; local `bun --version` (or `mise ls bun` if mise is adopted) matches too.

## Sources

- [mise.jdx.dev/about.html](https://mise.jdx.dev/about.html) — what mise is
- [mise.jdx.dev/lang/bun.html](https://mise.jdx.dev/lang/bun.html) — Bun backend support, `mise.toml` syntax, upgrade caveat
- [jdx/mise-action](https://github.com/jdx/mise-action) (README, main branch) — action inputs, caching, `mise install --locked` auto-detection
- [mise.jdx.dev/continuous-integration.html](https://mise.jdx.dev/continuous-integration.html) — official CI guidance, example workflow, `MISE_SAFE`
- [mise.jdx.dev/environments.html](https://mise.jdx.dev/environments.html) and [mise.jdx.dev/configuration.html](https://mise.jdx.dev/configuration.html) — `[env]` table, dotenv/`env_file`, `redact`, secrets guidance, config precedence
- `.github/workflows/ci.yml` (this repo) — three jobs, per-job `env:` blocks (DB URL, secrets, `VITE_SERVER_URL` only in `e2e`)
- `.github/actions/setup-church-ci/action.yml` (this repo) — `oven-sh/setup-bun@v2` with `bun-version: latest` (lines 11-13), `actions/cache@v4` on `~/.bun/install/cache` (lines 15-20), `.env`-writing step (lines 26-37)
