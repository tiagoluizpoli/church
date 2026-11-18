# Server-owned seed subsystem with purpose-specific recipes

## Status

accepted

## Context

Application data population is split across database-package seeds, server scripts,
integration fixtures, and one large E2E seed. These paths construct overlapping
Church domain graphs with different lifecycle rules, identifiers, and commands.
Their application-specific data also makes the generic database package own
Church behavior, and relevant schema changes can leave one path stale without an
explicit seed-impact decision.

## Decision

Application-specific seed data belongs in one server-owned subsystem under
`apps/server/seeds`, because its Churches, Ministries, identities, and scheduling
graphs encode Church application behavior. `@church/db` retains schema,
connection, migration, transaction, reset, and database-target safety; root Bun
commands remain the supported operator surface.

The subsystem provides shared, schema-typed data builders and composes them into
separate development, integration, and E2E recipes. Tests may keep
assertion-specific intent locally, but reusable database construction comes from
the shared builders. Domain origins that must remain exercised, such as Church
Provisioning, use the application workflow; bulk data and exceptional fixture
states may use explicit direct-state builders.

The development workflow is one destructive, fail-closed command,
`bun run db:reseed:dev`. It resolves the current worktree's development target,
resets and migrates it, loads a deterministic scenario from an explicit anchor
day, and verifies the result. Worktree bootstrap continues to provision and
migrate databases without loading application data automatically.

Relevant schema and persistence changes must run the seed contracts and either
update the subsystem or explicitly acknowledge that they have no seed impact.

## Consequences

- Development, integration, and E2E retain their different isolation and
  lifecycle needs without maintaining independent construction vocabularies.
- Church-specific scenario policy leaves the generic database package.
- A single global mutable dataset is not shared by every consumer.
- Fully independent seed implementations are replaced by shared builders and
  purpose-specific recipes.
- The manual development workflow becomes deterministic and fail-closed, while
  automatic application-data loading remains outside worktree bootstrap.
