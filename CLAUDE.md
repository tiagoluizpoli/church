# Church guidance

## Project entry

Before changing application code, read the
[constitution](.specify/memory/constitution.md) and the applicable routes
below. This entry composes with the global baseline and language profiles;
project guidance overrides them.

### Testing and tooling

Run repository commands from the root through its Bun scripts. Use
`bun run validate:affected` after a changed implementation slice; reserve
`bun run validate` for final handoff or merge validation. Test files belong in
the owning project's `test` directory. Details: [tooling](docs/agents/tooling.md).

### Routes

- Domain or planning: [domain docs](docs/agents/domain.md), the applicable
  `docs/adr/` decisions, and the relevant plan/specification.
- Backend, API, database, security, or tenancy: [backend guidance](docs/agents/backend.md).
- Frontend or UI: [frontend guidance](docs/agents/frontend.md).
- GitHub issue work: [issue tracker](docs/agents/issue-tracker.md).
- Triage: [triage labels](docs/agents/triage-labels.md).
