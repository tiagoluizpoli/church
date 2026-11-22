# syntax=docker/dockerfile:1
# Frontend image: static build served by Caddy, which proxies /api (API and
# auth) to the server service. Built for the same-origin API (`/`), so one
# image serves any environment's hostname.
FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
ARG APP_REVISION
RUN test -n "$APP_REVISION"
# Optional: the browser-restricted Maps Embed key; unset, the public page shows no map.
ARG MAPS_EMBED_API_KEY
# Hidden source maps go to the error tracker under the revision the bundle
# reports (#929), then leave dist before the served stage copies it; a failed
# upload fails the build, and a build without any setting skips the upload
# with a warning. The tracker settings are optional build secrets, never args
# or layers (tooling/deployment/source-maps.ts).
WORKDIR /app/apps/web
RUN --mount=type=secret,id=SENTRY_URL,env=SENTRY_URL \
    --mount=type=secret,id=SENTRY_ORG,env=SENTRY_ORG \
    --mount=type=secret,id=SENTRY_PROJECT,env=SENTRY_PROJECT \
    --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    VITE_SERVER_URL=/ VITE_APP_REVISION=$APP_REVISION VITE_MAPS_EMBED_API_KEY=$MAPS_EMBED_API_KEY bun run build -- --sourcemap hidden \
 && bun run --cwd /app release:source-maps --dist=/app/apps/web/dist --revision="$APP_REVISION" \
 && printf '%s\n' "$APP_REVISION" > dist/revision.txt

FROM caddy:2.11-alpine
RUN adduser -D -u 10001 web
COPY deployment/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
USER web
EXPOSE 8080
