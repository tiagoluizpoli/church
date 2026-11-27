# Church Backend

Load for backend, API, database, security, tenancy, or infrastructure work.

- Keep application-specific domain logic, routers, and services in
  `apps/server` (`@church/server`). Shared packages contain generic concerns
  only.
- Preserve the Clean Architecture boundary between domain, persistence, and
  infrastructure. Use Fastify/OpenAPI/orval at API boundaries, Zod for runtime
  validation, and Drizzle for database access.
- Outbox delivery facts are frozen at enqueue and rendered later. When you add
  or rename a field in a delivery-facts or email payload shape, rows enqueued
  before the deploy still carry the old shape: treat a missing required fact as
  skip-and-log (never invent a value), and cover an old-shape row in the outbox
  integration suite.
- Enforce Church tenancy with `church_id`. Keep credential-sensitive work on
  the server.
- Functions, methods, constructors and function types take at most one
  parameter: a named object type. Transaction handles, signals and options go
  inside it. Inline object types are not allowed, as required by the
  [constitution](../../.specify/memory/constitution.md) VII.
  `bun run validate:named-parameters` enforces it.
- Server config is passed in by the composition root as the `config` field of
  the constructor's named object. A root-built class never imports `appConfig`
  from `@church/app-config`.
- A class reads the config values it uses once, in the constructor, into named
  `private readonly` fields. Methods use those fields, and the class does not
  keep the whole `config`.
- Domain functions never read config. Their DI-built caller destructures the
  values and passes them as named params (for example `policy`).
- Only the composition root (`main/di/`), container-less scripts
  and seeds import `@church/app-config` (or any subpath) directly.
- Rules the server and web must answer identically (Church Slug, Social Link
  detection) live in `@church/domain-rules`; any layer, the domain included,
  may import it (constitution, Shared domain rules package).
- Select backend and test specialist skills when their descriptions fit the
  identified work.

## Contracts and composition

Owner rule. `bun run lint` and `validate:affected` fail on an `interface` or
`type` declared in a server implementation file
([the server types guard](tooling.md#server-types)).

- An implementation file holds only implementation. Each type has one home:
  - An application class: its public inputs and outputs, private helper inputs,
    result shapes and `...Dependencies` bag go in
    `domain/contracts/application/<name>.ts`.
  - A repository: `domain/contracts/infrastructure/<name>.repository.ts`.
    Drizzle row and query types cannot enter the domain, so they sit in the
    repository's sibling `.types.ts`.
  - Any other adapter: what callers see goes in
    `domain/contracts/infrastructure/<name>.ts`. A type that names a
    third-party client stays beside the adapter in its `.types.ts`.
  - HTTP shapes (`api/`) and composition-root shapes (`main/`): a sibling
    `.types.ts`, unless a domain contract already covers them. `api/dtos/`
    holds the schemas and their types.
- Each application class implements its `I<Name>`. Repository and other
  infrastructure contracts keep their names without the `I`
  (`ChurchRepository`, `EmailSender`). Controllers implement
  `FastifyController` (`api/contracts/fastify-controller.ts`).
- Build each class once in the composition root (`main/di/`) and inject it,
  typed by its contract. A class never constructs another injectable class.
  Reads that several modules share become a small injected reader with its own
  contract.
- A contract imports another contract by its full alias, such as
  `@/domain/contracts/infrastructure/transaction-context`. Biome's
  domain-layer rule allows only import paths that contain `domain`.
- Pure domain rules (`domain/services/`) are grouped by domain concept
  (`scheduling/`, `planning/`, `invitations/`, `notifications/`,
  `church-identity/`), and each rule's types sit in a sibling
  `<rule>.types.ts`. A rule gets its own folder inside a concept only at three
  or more files.
- A rule takes the entities themselves. Behaviour that belongs to one entity is
  a method on it, such as `Shift.overlaps`; a type that only copies an
  entity's fields is the smell that points there.

## Rollback-compatible migrations

Prefer migrations the previous application still runs against (add nullable
columns or tables first, drop in a later release). When a new migration is,
put `-- rollback-compatible: <why the previous application still works>` on a
line of its SQL file when you create it; `deploy:rollback` refuses to roll an
environment back past any deployed migration without that line
([rollback runbook](../operations/rollback.md)). Never add it to an applied
migration, and never claim it for a drop, rename, new `NOT NULL` without a
default or tightened constraint the previous application can violate.

## Deployment preflight: migration 0028

Migration `0028_noisy_gunslinger` creates the unique index
`template_time_block_template_label_idx` on `(template_id, lower(label))`. It
does not trim labels, diagnose duplicates or repair data, and the journal
alone does not show whether a target has it. This applies only to a deployment
where 0028 is still pending; never rewrite the historical migration. Deployed
environments run the collision query automatically in the `migrate` service
(`packages/db/src/deployment-preflight.ts`) and stop on a collision. Before
such a deployment, identify the target and revision, compare the ledger with
the branch journal, check the index definition and validity, and run this
read-only check:

```sql
SELECT template_id, lower(label) AS normalized_label,
       count(*) AS duplicates, array_agg(id ORDER BY id) AS block_ids
FROM template_time_block
GROUP BY template_id, lower(label)
HAVING count(*) > 1;
```

- Already recorded with a valid unique index: nothing to do.
- Pending, no collisions: block writes between preflight and index creation,
  then verify the migration succeeded.
- Collisions: stop that deployment and get an owner-approved, row-specific
  label fix that keeps TemplateTimeBlock identity and UsualSetup references,
  then repeat the preflight. No blind deletion or deduplication.

Migration `0052_ministry_default_direction_all_out` flips existing `all_in`
Ministries to `all_out`; it is repeat-safe and leaves Sent staffing alone.
Running it against a deployment is a separate, authorized step.
