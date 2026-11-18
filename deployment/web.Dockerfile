# Frontend image: static build served by nginx, which proxies /api (API and
# auth) to the server service. Built for the same-origin API (`/`), so one
# image serves any environment's hostname.
FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
ARG APP_REVISION
RUN test -n "$APP_REVISION"
WORKDIR /app/apps/web
RUN VITE_SERVER_URL=/ bun run build \
 && printf '%s\n' "$APP_REVISION" > dist/revision.txt

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
