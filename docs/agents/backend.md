# Church Backend

Load for backend, API, database, security, tenancy, or infrastructure work.

- Keep application-specific domain logic, routers, and services in
  `apps/server` (`@church/server`). Shared packages contain generic concerns
  only.
- Preserve the Clean Architecture boundary between domain, persistence, and
  infrastructure. Use Fastify/OpenAPI/orval at API boundaries, Zod for runtime
  validation, and Drizzle for database access.
- Enforce Church tenancy with `church_id`. Keep credential-sensitive work on
  the server.
- Use named object parameters and named object shapes in modified application
  code, as required by the [constitution](../../.specify/memory/constitution.md).
- Server config comes only through DI: take it with
  `@inject('AppConfig') config: AppConfig`. A DI-built class never imports
  `appConfig` from `@church/app-config`.
- A class reads the config values it uses once, in the constructor, into named
  `private readonly` fields. Methods use those fields, and the class does not
  keep the whole `config`.
- Domain functions never read config. Their DI-built caller destructures the
  values and passes them as named params (for example `policy`).
- Only the composition root (`main/di/injections.ts`), container-less scripts
  and seeds import `@church/app-config` directly.
- Select backend and test specialist skills when their descriptions fit the
  identified work.
