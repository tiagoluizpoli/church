# API image: also runs the one-shot migration (packages/db db:migrate:deployment).
# Configuration and secrets arrive at runtime through the process environment;
# only the source revision is baked in.
FROM oven/bun:1.4.5
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
# Schedule exports render with the pinned Typst CLI (.tools/bin/typst); its
# installer unpacks a .tar.xz.
RUN apt-get update && apt-get install -y --no-install-recommends xz-utils \
    && rm -rf /var/lib/apt/lists/* && bun run typst:install
ARG APP_REVISION
RUN test -n "$APP_REVISION"
ENV APP_REVISION=$APP_REVISION \
    NODE_ENV=production \
    CHURCH_EXEC_PURPOSE=deployment
USER bun
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["bun", "run", "start:deployment"]
