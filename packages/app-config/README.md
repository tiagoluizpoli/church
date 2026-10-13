# @church/app-config

Plain shared config data read by the server and the web app: policy values and `parked` switches. No logic except `withAllParkedOn`.

## Add a section or key

1. Add it to the `AppConfig` interface and to `appConfig` in `src/index.ts`, grouped by section (`churchInvitation`, `outbox`, ...).
2. Name by unit: durations `...Ms` (use the `SECOND_MS`/`MINUTE_MS`/`HOUR_MS`/`DAY_MS` constants), day counts `...Days`, minutes `...Minutes`, counts and caps plain names (`maxAttempts`, `dailyCap`).
3. Read it from `appConfig` (or the injected `injection.config.appConfig` on the server). Tests read it from `appConfig` too, never a copy of the number.

## Add a parked switch

A parked switch hides a feature that is built but not shipped. `false` = off.

1. Add the key under `parked` in the interface and in `appConfig` (default `false`).
2. Server: in the controller, take `config: AppConfig` from DI and wrap the route registration in `if (this.config.parked.<key>)`.
3. Web: gate the UI at the mount point (do not render it), not with CSS.
4. Tests: cover switch-on with `withAllParkedOn(appConfig)` (HTTP/controller tests build the app with it; component tests mock `@church/app-config` with it) and add a switch-off assertion (route 404, UI absent).
