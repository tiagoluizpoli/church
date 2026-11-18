# Connection failures answer 503; the client treats no-response/502/503/504 as an outage and retries without limit

## Status

accepted ([#904](https://github.com/tiagoluizpoli/church/issues/904), spec [#903](https://github.com/tiagoluizpoli/church/issues/903))

## Context

While the database is down the API answers every request with a generic 500, the same as a code bug. The web client cannot tell "wait, it will come back" from "this page is broken", so it toasts and gives up after three retries.

## Decision

- **Server.** The error handler classifies a database-connection failure and answers **503** with `Retry-After: 5` and the generic localized envelope (`error: SERVICE_UNAVAILABLE`). The list is fixed and checked on the error and its `cause` chain: Postgres SQLSTATE class `08` (connection exception), `57P01`–`57P03` (shutdown / cannot connect now), `53300` (too many connections), and driver socket errors `ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`. Every other unhandled error stays 500. Domain-error, validation and serialization mapping do not change.
- **Logging.** A connection failure is logged at `error` with its code only, never the message, credentials or connection string.
- **Client.** A request with no response, or a 502/503/504, is an **outage** and is retried without limit (exponential backoff, capped at about 30s). Any other status is not an outage.

## Amendments

- **The session guard is stricter.** A failed session call (no response or any 5xx) never redirects to login; it shows the reconnecting state, because only a successful "no session" answer proves the user is signed out (spec [#903](https://github.com/tiagoluizpoli/church/issues/903), [#906](https://github.com/tiagoluizpoli/church/issues/906)). Every other query, the active-church guard included, keeps the no-response/502/503/504 outage rule.
- **Socket errors cover any upstream.** `ECONNREFUSED`, `ETIMEDOUT` and `ECONNRESET` are matched on any error in the chain, so an unreachable upstream dependency, not only the database, also answers 503. That is intended: it is temporary unavailability, not a bug.

## Considered Options

- **The client probes readiness after any 500.** Rejected: the server already knows the cause at failure time, so a probe adds a second call that can race the first (the database may recover or fail between them). The client rule stays simple with the status alone, and the same signal serves error reporting in [#902](https://github.com/tiagoluizpoli/church/issues/902).

## Consequences

- Monitors and clients read 503 as temporary unavailability and 500 as a bug.
- The classification list is closed: a new connection-failure shape needs an edit here and in `connection-error.ts`.
