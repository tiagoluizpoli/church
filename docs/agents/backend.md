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
- Select backend and test specialist skills when their descriptions fit the
  identified work.
