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
