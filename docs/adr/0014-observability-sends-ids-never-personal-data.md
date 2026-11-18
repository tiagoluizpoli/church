# Observability sends ids, never personal data

## Status

accepted ([#902](https://github.com/tiagoluizpoli/church/issues/902))

## Context

The app holds Church Members' personal data: names, emails, availability and Ministry membership. LGPD applies, because the users are Brazilian. Error reporting, log shipping and tracing copy request data out of the server and keep it for weeks. Pino's default request log already records the full URL, which can carry auth tokens such as Better Auth's password-reset link, and the client's IP address.

## Decision

- **Allowed identifiers.** Error events, logs and spans may carry internal ids only: the User id, the Active Church id and any id in the route. Email, names and IP addresses never leave the server.
- **Never sent.** Request and response bodies, cookies and the `authorization` header. Other headers are sent only from an allowlist.
- **URLs.** Query strings are dropped. Path segments that carry a token (password reset, invitation, review and session tokens) are masked. A single pino serializer does this, and log shipping and error reporting both go through it.
- **SQL in spans.** Spans record the query text, never its parameter values.
- **Browser reports.** The web sends crash reports through our own API (the Sentry SDK `tunnel` option). The server scrubs them again under these rules before forwarding them to the error tracker.
- **No session replay.** Replay would record members' data on screen, so it is never enabled.
- **Retention.** Production and staging keep logs 30 days and error events 90 days. Development keeps logs 7 days and error events 30 days. Each tool's own configuration holds these numbers. A tool that can't match a number exactly is set lower, never higher.

## Consequences

- An error report says who was affected only as an id. Finding the person means looking that id up in the app's own database.
- Every new route with a token in its path needs its segment added to the masking rule.
