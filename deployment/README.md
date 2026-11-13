# Deployed application

Church runs in three deployed environments: development on the homelab,
staging and production on the VPS. Each one is a Dokploy Compose application
built from [compose.yml](compose.yml) and the same two images. Local and
worktree development does not use anything here. It keeps the root
`docker-compose.yml`, `bun run dev` and the generated `.env.local` URLs and
ports.

## Images

| Image | Dockerfile | Contents |
| --- | --- | --- |
| server | [server.Dockerfile](server.Dockerfile) | the API (`start:deployment`), the migration command and the operator database command |
| web | [web.Dockerfile](web.Dockerfile) | the static frontend on nginx, port 8080, which proxies `/api/` to `server:3000` ([nginx.conf](nginx.conf)) |

Build both from the repository root at the commit being deployed:

```sh
docker build -f deployment/server.Dockerfile --build-arg APP_REVISION="$(git rev-parse HEAD)" -t <registry>/church-server .
docker build -f deployment/web.Dockerfile --build-arg APP_REVISION="$(git rev-parse HEAD)" -t <registry>/church-web .
```

`APP_REVISION` is the only build input, and the build fails without it.
`bun install --frozen-lockfile` pins the dependencies, and the base images
are pinned to versions. `.dockerignore` keeps every `.env*` value file out of
the build context. Only the Varlock `.env.schema` contracts go in. Each
deployment selects images by immutable digest (`image@sha256:…`). Staging and
production run the same digests.

## Runtime inputs

Each environment's Dokploy Compose environment supplies these values. Compose
refuses to start when a required one is missing. The server validates them
again at startup through Varlock (`CHURCH_EXEC_PURPOSE=deployment`) and the Zod
contract in `packages/env/src/server.ts`.

| Variable | Required | Meaning |
| --- | --- | --- |
| `SERVER_IMAGE` | yes | server image digest |
| `WEB_IMAGE` | yes | web image digest |
| `CHURCH_ENVIRONMENT` | yes | `development`, `staging` or `production`; selects email delivery |
| `DATABASE_URL` | yes, secret | `postgresql://church_<environment>:<password>@<host>:5432/church_<environment>` |
| `BETTER_AUTH_SECRET` | yes, secret | at least 32 characters, different in every environment |
| `PUBLIC_ORIGIN` | yes | the environment's public origin, e.g. `https://staging.example.org`; it becomes `BETTER_AUTH_URL` and `CORS_ORIGIN` |
| `RESEND_API_KEY` | yes, secret | Resend key for outgoing email |
| `RESEND_FROM_EMAIL` | yes | sender, e.g. `Church <noreply@example.org>` |
| `DATABASE_NETWORK` | no | Docker network that reaches the host's PostgreSQL (default `dokploy-network`) |

The images set `NODE_ENV=production` for every environment, so debug
endpoints stay off and API docs are not served. `CHURCH_ENVIRONMENT`, not
`NODE_ENV`, tells the environments apart. Production always sends through
Resend. Development and staging deploy with
`-f compose.yml -f compose.mailpit.yml` and route email by the database
setting described in
[docs/deployment/email-delivery.md](../docs/deployment/email-delivery.md).

## Local versus deployed

| Concern | Local / worktree / tests | Deployed |
| --- | --- | --- |
| API URL in the browser | explicit `VITE_SERVER_URL` (absolute, per worktree port) | `VITE_SERVER_URL=/`: same origin, relative `/api` |
| Auth client | `baseURL` = `VITE_SERVER_URL` | no `baseURL`: Better Auth uses the page origin plus `/api/auth` |
| CORS / auth origin | web origin and server URL from `.env.local` | both `PUBLIC_ORIGIN`; requests arrive same-origin through nginx |
| Cookies | `SameSite=Lax`, not `Secure`, over plain HTTP | `Secure` with `SameSite=None` when `PUBLIC_ORIGIN` is `https://` |
| Configuration | Varlock schemas plus generated `.env.local` | Varlock schemas plus the process environment; no value files |
| Database | `church_<worktree>_*` on the shared local instance | `church_<environment>` on the host's shared instance |
| Unit and E2E email | capture | not applicable |

## Topology

- `migrate` runs `drizzle-kit migrate` once and exits. `server` starts only
  after it succeeds, so a failed migration stops the deployment.
- `server` is not routed publicly. Its healthcheck calls `/api/health`.
- `web` is the only public service. Its healthcheck reads `/revision.txt`, and
  it starts once `server` is healthy.
- `migrate` and `server` join `DATABASE_NETWORK` to reach PostgreSQL. `web`
  joins only the project's own network. Dokploy must therefore run the
  application with **Isolated Deployment** enabled, so that Traefik can reach
  `web`, and the domain must route to service `web`, port `8080`. Do not
  attach `web` to the shared network: staging and production both have a
  `server` service on the VPS, and on a shared network that name could resolve
  to the other environment.
- Before infrastructure setup, confirm on the installed Dokploy version that
  Isolated Deployment and the external network behave as described.

Startup never seeds, provisions a Church or creates users. It keeps all data.
Migrations only change the schema. A migration with its own preflight, such as
`0028` in `docs/agents/backend.md`, still needs that preflight before the first
deployment that applies it. A newly provisioned empty database has no rows for
it to collide with.

## Readiness

| Check | Healthy | Unhealthy |
| --- | --- | --- |
| `GET <origin>/revision.txt` | the frontend's `APP_REVISION` | a different revision means the frontend is stale |
| `GET <origin>/api/health` | `200 {"status":"ok","database":"ok","revision":"<sha>"}` | `503 {"status":"unavailable","database":"unavailable","revision":"<sha>"}` when the database does not answer; a different `revision` means the API is stale; `502` when the server is down |

The responses contain no hostnames, users or error details. The server log
has the cause.

## Environment databases

Each host runs one PostgreSQL instance: the homelab for development, the VPS
for staging and production. Each environment has its own role and database,
both named `church_<environment>`. The role owns only its database and has no
superuser, `CREATEDB`, `CREATEROLE`, replication or role memberships. Its
database revokes `CONNECT` from `PUBLIC`, so no other environment's role can
connect to it.

Run this once per environment on that environment's host, and again to rotate
the password. Reruns keep the data:

```sh
docker run --rm --network <database network> \
  -e POSTGRES_ADMIN_URL='postgresql://<admin>:<password>@<postgres host>:5432/postgres' \
  -e ENVIRONMENT_DATABASE_PASSWORD='<new environment password>' \
  <server image> bun run --cwd /app/packages/db db:provision:environment staging
```

Then set that environment's `DATABASE_URL` in Dokploy to the role and
password. The administrator URL is used only for this command and is never
stored in an application environment.

## Platform Operator and first Church

Nothing in a deployment creates users, a Platform Operator or a Church. An
operator runs two explicit commands inside the environment's running `server`
container (it already has that environment's `DATABASE_URL` and
`CHURCH_ENVIRONMENT`):

```sh
docker compose exec server bun run operator setup-identity --environment staging
docker compose exec server bun run operator provision-church --environment staging \
  --name '<Church name>' --slug '<slug>' --admin-email '<admin email>' \
  --base-url 'https://<environment origin>'
```

- `--environment` is required and must be `development`, `staging` or
  `production` **and** equal the container's `CHURCH_ENVIRONMENT`. Any other
  value, including `local`, is refused before a write.
- `setup-identity` is idempotent. It creates the Platform Operator User with
  no credentials, password or Church Membership. `provision-church` refuses
  until it has run.
- `provision-church` reuses Church provisioning: one Church and one pending
  ChurchAdmin invitation. Nobody is created with a password; the invited admin
  redeems the printed `/invitations/church/<id>` link through normal
  onboarding (email verification code, own password) and can then invite
  others.
- The printed redemption link is a bearer secret for that admin: send it only
  to the admin's address or channel, never to a ticket or chat, and do not keep
  command output in shared logs. A wrong admin email is fixed by repairing the
  invitation, not by editing the database.

### After a clean reset

A clean-installation reset removes users, Churches, sessions, pending emails
and captured messages, and keeps operator configuration
(`runtime_configuration`, e.g. `email_delivery_mode`). Run both commands again
afterwards: `setup-identity`, then `provision-church` for each Church. The
only operator configuration they need is the environment's existing
`DATABASE_URL`, `CHURCH_ENVIRONMENT` and the public origin for `--base-url`.
