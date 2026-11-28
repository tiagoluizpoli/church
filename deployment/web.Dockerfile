# syntax=docker/dockerfile:1
# Frontend image: static build served by Caddy, which proxies /api (API and
# auth) to the server service. Built for the same-origin API (`/`), so one
# image serves any environment's hostname.
FROM oven/bun:1.4.5 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
ARG APP_REVISION
RUN test -n "$APP_REVISION"
# Optional Google Maps keys (per environment): the referrer-restricted browser
# key drives the address search and pin map, the Embed key the public page's
# map. Unset, those are hidden; CEP lookup and manual entry still work. The
# Map ID goes with the browser key: the pin map's Advanced Markers need it.
ARG GOOGLE_MAPS_BROWSER_KEY
ARG GOOGLE_MAPS_EMBED_KEY
ARG GOOGLE_MAPS_MAP_ID
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
    VITE_SERVER_URL=/ VITE_APP_REVISION=$APP_REVISION VITE_GOOGLE_MAPS_BROWSER_KEY=$GOOGLE_MAPS_BROWSER_KEY VITE_GOOGLE_MAPS_EMBED_KEY=$GOOGLE_MAPS_EMBED_KEY VITE_GOOGLE_MAPS_MAP_ID=$GOOGLE_MAPS_MAP_ID bun run build -- --sourcemap hidden \
 && bun run --cwd /app release:source-maps --dist=/app/apps/web/dist --revision="$APP_REVISION" \
 && printf '%s\n' "$APP_REVISION" > dist/revision.txt

FROM caddy:2.11-alpine
RUN adduser -D -u 10001 web
COPY deployment/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
USER web
EXPOSE 8080
