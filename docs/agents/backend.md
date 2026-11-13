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
  and seeds import `@church/app-config` directly.
- Select backend and test specialist skills when their descriptions fit the
  identified work.

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
