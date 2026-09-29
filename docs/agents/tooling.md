# Church Tooling

Run commands from the repository root through existing Bun scripts. Do not
invoke package tools directly: root scripts carry required environment, filters,
and task ordering.

| Intent | Command |
| --- | --- |
| Lint + format | `bun run lint:fix` |
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |
| Unit/component tests | `bun run test:unit` |
| Integration tests | `bun run test:integration` |
| Story E2E | `bun run test:e2e -- tests/[path].spec.ts` |
| Complete test suite | `bun run test` |
| Affected validation | `bun run validate:affected` |
| Final validation | `bun run validate` |
| Reset development DB | `bun run db:seed:reset` |
| Seed development users | `bun run db:seed:dev-users` |
| Generate worktree `.env.local` | `bun run env:local` |
| Revalidate its ports before launch | `bun run env:local -- --revalidate` |

Use root Bun scripts by default. The focused-workspace exception is
`bunx turbo -F <workspace> <task> --only -- <test path>`. Generate the API
client only with `bun run api:generate`.

The server relies on its package TypeScript configuration; run server scripts
through their package scripts. In particular, server decorator metadata is not
available to root TypeScript execution. `apps/server/auto-generated-api.yaml`
is input to API generation, not a hand-edited contract.

Finish the current implementation phase before review. Run targeted tests,
then affected validation, plus the relevant story E2E when one exists; review
the modified files and repair every finding in the same phase. Fix lint,
format, and type errors directly—suppression directives require explicit user
permission. Install Playwright's pinned Chromium with `bunx playwright install
chromium` when its executable is absent.
