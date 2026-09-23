<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/023-event-builder/plan.md`.
<!-- SPECKIT END -->

## Repository Instructions

Before changing code, read and follow:

- `agents.local.md` for project architecture, coding rules, and verification requirements.
- `CONTEXT.md` for the project's domain language.
- `.specify/memory/constitution.md` for non-negotiable project governance.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (tiagoluizpoli/church), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Test strategy and CI gates

Before a PR, run `bun run validate:affected`, not `bun run validate` (final-handoff only). See [ADR-0004](docs/adr/0004-test-strategy-and-ci-gate-policy.md) and the README's "Test Policy: What To Run" table.

### Rules
- Test files ALWAYS goes in the "test" directory of the project