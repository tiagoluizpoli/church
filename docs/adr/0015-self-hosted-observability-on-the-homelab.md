# Self-hosted observability runs on the homelab until real users arrive

## Status

accepted ([#902](https://github.com/tiagoluizpoli/church/issues/902)); privacy rules in [ADR 0014](0014-observability-sends-ids-never-personal-data.md)

## Context

One maintainer runs the project with no budget. The only VPS (4 CPUs, 6.2 GB of RAM with about 1.3 GB free as of 2026-11-17) runs staging, production and other projects. The homelab has spare capacity and RustFS (S3-compatible storage), and it already reaches the VPS over Tailscale.

## Decision

- **Self-hosted, open-source tools only.** No hosted free tiers for now. They can be reconsidered later.
- **Stack on the homelab:**
  - GlitchTip groups errors into issues. It accepts the Sentry SDK and needs about 512 MB.
  - Loki stores logs.
  - Tempo stores traces.
  - Grafana searches logs and traces, links between them, and runs the alert rules.

  Loki and Tempo keep their data in RustFS. All four are reachable over the tailnet only.
- **Small pieces on the VPS:**
  - A log shipper that reads container stdout and sends it to Loki. Bun can't run pino's worker-thread transports.
  - Uptime Kuma as an outside watchdog.
  - Self-hosted ntfy, behind a login.
- **Tracing from day one.** A `bun --preload` OpenTelemetry setup with `@fastify/otel` (registered explicitly) and `@opentelemetry/instrumentation-pg`. Bun has no ESM hooks, but both work under Bun 1.4.3. A CI smoke test fails if spans stop appearing. Running the server on Node is the fallback if a Bun upgrade breaks this.
- **Errors-only Sentry SDK.** `@sentry/bun` and `@sentry/react` report errors to GlitchTip. Sentry's own tracing stays off, so it doesn't replace our OpenTelemetry setup.
- **Correlation.** The trace id is the request id. It is returned in the `x-request-id` header and in 500 responses, and it appears on every log line and error event. Users see its first 8 characters as a reference code.
- **Alerts.** Every alert goes to both Telegram and ntfy, which runs on Android without the ntfy.sh relay. GlitchTip has no Telegram integration, so its webhook reaches Telegram through the n8n instance already on the VPS. Uptime Kuma also checks n8n, ntfy and the homelab's Grafana. Only production alerts.
- **Settings.** App-side settings (log level, trace sample rate, reporting on or off) are environment variables, not `runtime_configuration`. Reporting has to work while the database is down.

## Considered Options

- **Everything on the VPS.** Rejected: the stack needs 1–1.5 GB, and that is all the free memory.
- **Sentry self-hosted or SigNoz.** Rejected: they need 16 GB and at least 4 GB.
- **Grafana alone, with errors kept as log lines.** Rejected: it has no grouping of errors into issues, no alert on a new kind of error, and no source-mapped web stack traces.
- **`runtime_configuration` for the observability settings.** Rejected: the database can be the very thing that is failing, and the sample rate is read on every request.

## Consequences

- **The homelab going offline blinds staging and production.** This happened during a power outage in the week of 2026-11-17. Their errors, logs and traces are lost after the shipper's buffer fills, and error alerts stop. Uptime Kuma on the VPS still reports downtime.
- **Trigger to move.** Before real churches use production, the stack moves to a dedicated monitoring VPS, so there will be two VPSs. If an earlier homelab outage hides a production problem, the move happens then.
