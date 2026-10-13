# @church/app-config

Shared config read by the server and the web app: policy values and `parked` switches. A Zod schema defines it; the only logic is `withAllParkedOn`.

## Add a section or key

1. Add it to `appConfigSchema` in `src/index.ts` with a real constraint (`positiveInt` for durations, caps, days, minutes; `z.boolean()` for switches), then to the `appConfig` value, grouped by section (`churchInvitation`, `outbox`, ...). `AppConfig` is inferred from the schema; never hand-write it. `appConfig` is parsed once at module load, so a bad value fails at startup.
2. Name by unit: durations `...Ms` (use the `SECOND_MS`/`MINUTE_MS`/`HOUR_MS`/`DAY_MS` constants), day counts `...Days`, minutes `...Minutes`, counts and caps plain names (`maxAttempts`, `dailyCap`).
3. Add a schema test for the new constraint in `tests/app-config.test.ts`.

## Read it

- Server: take it through DI, `@inject('AppConfig') private readonly config: AppConfig`. DI-built classes never import `appConfig`; domain functions get the values as named params from their caller. Only `main/di/injections.ts`, container-less scripts and seeds import the package.
- Web: import `appConfig` directly (no DI on the web).
- Destructure the values once at the top of the function or test (`const { maxAttempts } = this.config.verificationCode;`) and use the short name; no `config.section.key` chains in conditions, arithmetic or call arguments.
- Tests read values from `appConfig` and pass them in, never a copy of the number.

## Add a parked switch

A parked switch hides a feature that is built but not shipped. `false` = off.

1. Add the key under `parked` in the schema and in `appConfig` (default `false`).
2. Server: in the controller, take `config: AppConfig` from DI and wrap the route registration in `if (this.config.parked.<key>)`.
3. Web: gate the UI at the mount point (do not render it), not with CSS.
4. Tests: cover switch-on with `withAllParkedOn(appConfig)` (HTTP/controller tests build the app with it; component tests mock `@church/app-config` with it) and add a switch-off assertion (route 404, UI absent).
