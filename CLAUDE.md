# Church guidance

## Project entry

Before changing application code, read the
[constitution](.specify/memory/constitution.md) and the applicable routes
below. This entry composes with the global baseline and language profiles;
project guidance overrides them.

### Testing and tooling

Run repository commands from the root through its Bun scripts. While
implementing, iterate on the focused existing tests for the changed behavior;
run `bun run validate:affected` once when the ticket is complete, in the
background, and check its final status; reserve `bun run validate` for final
handoff or merge validation. Tests, and every
test helper, setup file, fixture, mock and contract suite, live in the owning
project's `tests/` directory at the path that mirrors `src/`, never under
`src`. Tests import source as `@/…`, other test files as `@/tests/…` and server
seeds as `@/seeds/…`; a relative import only for a file in the same folder.
`bun run lint` fails otherwise. Details: [tooling](docs/agents/tooling.md).

### Routes

- Domain or planning: [domain docs](docs/agents/domain.md), the applicable
  `docs/adr/` decisions, and the relevant plan/specification.
- Backend, API, database, security, or tenancy: [backend guidance](docs/agents/backend.md).
- Frontend or UI: [frontend guidance](docs/agents/frontend.md).
- GitHub issue work: [issue tracker](docs/agents/issue-tracker.md).
- Triage: [triage labels](docs/agents/triage-labels.md).
