# Research: RustFS on the VPS for app files

Status: research only. Nothing on the VPS, the homelab or in the app was
changed. Ticket: #974, part of map #973 (Church Settings).

Infrastructure facts were read on 2026-11-21 through the Dokploy API of each
host (read-only `project.all`, `compose.one`, `postgres.one`,
`destination.all`) and a read-only S3 bucket listing of the VPS MinIO. No
secret values appear here.

## Summary

| Question | Recommendation |
| --- | --- |
| What uses the VPS MinIO | Only Dokploy PostgreSQL backups (bucket `backups`, ~216 MiB). No app, not Church, and not Plane (Plane bundles its own MinIO). |
| How to migrate | Backups do not belong on the VPS. Move them to the homelab RustFS and repoint the Dokploy destination. Drop the two leftover buckets. RustFS on the VPS starts empty and holds app data only. |
| Deploying RustFS | Dokploy Compose in the `Shared` project, pinned `rustfs/rustfs:1.0.6`, a named volume, no published ports, the two existing `storage` and `console-storage` domains over Let's Encrypt. One bucket and one scoped key per Church environment. |
| How files are read | Logos are public objects: an anonymous `s3:GetObject` policy on the `public/` prefix only, with immutable content-hashed keys. Presigned GET cannot work in email because it expires after at most 7 days. Proxying every read through Fastify works but buys nothing for public logos. |
| How files are written | Upload through the Fastify server (`@fastify/multipart`), which checks size and type, then `PutObject`. Raster images only, no SVG. |
| S3 client | `@aws-sdk/client-s3` (v3) with `forcePathStyle: true`. Nothing S3-related is installed today. `Bun.S3Client` does not fit because dev and E2E run the server on Node. |
| Development (homelab) | A `church-development` bucket and key on the **VPS** RustFS. Never the homelab backup RustFS. |
| Local and worktrees | A `storage` (RustFS) service in the root `docker-compose.yml`, started with `db:start`, with one bucket per worktree that `db:bootstrap` creates and `db:prune` deletes, the same way as databases (ADR 0005). |

## 1. What uses the VPS MinIO today

**The service.** Dokploy project `Shared` has a raw Compose app named `minio`,
image `minio/minio:RELEASE.2025-04-22T22-12-26Z`, with a named volume
`minio-data`. Its domains are `storage.lunalabs.com.br` (port 9000) and
`console-storage.lunalabs.com.br` (port 9001), both on Let's Encrypt. The
compose file also publishes `9000:9000` on the host. The S3 API is therefore
reachable over plain HTTP on the VPS public IP, which bypasses TLS. (Source:
Dokploy `compose.one`.)

**Buckets** (read-only ListBuckets and ListObjectsV2):

| Bucket | Objects | Size | Contents |
| --- | --- | --- | --- |
| `backups` | 26 | ~216 MiB | Dokploy dumps: `shared-lunalabsshareddb-fbeezk/grocerify/database`, `portifolio-portifolio-db-abkeqc/directus` (daily, latest 2026-11-21), plus stale `directus/`, `grocerify/` (2026-03) and `n8n/` volume tars (2026-01) |
| `loki-church` | 2 | 398 B | Leftover Loki index from 2026-09. Loki now runs on the homelab (ADR 0015). |
| `temp-files` | 0 | 0 | Empty |

**Who talks to it.** Only the Dokploy destination **`Backup`**, endpoint
`http://<VPS IP>:9000`, bucket `backups`, over plain HTTP. These backups use it:

- `lunalabs-shared-db`, prefix `/grocerify/database`: enabled, daily.
- `lunalabs-shared-db`, prefix `staging/pre-deployment`: disabled. This is
  Church staging's pre-deployment pool, and
  [backups.md](../operations/backups.md) says it should go to the homelab
  `church-backups` destination, which also exists on the VPS Dokploy. It
  points at the VPS MinIO instead.
- `portifolio-db`, prefix `/directus`: enabled, daily.

Nothing else in either Dokploy (application env, compose files, domains)
mentions `storage.lunalabs.com.br`. Plane's `AWS_S3_ENDPOINT_URL` is
`http://plane-minio:9000`, a MinIO inside Plane's own compose, so retiring
the shared MinIO does not affect Plane. The Church repository has no S3 code
or configuration. `git grep` finds only backup tooling that calls Dokploy.

**How to migrate.**

1. Create a backups bucket for the non-Church projects on the homelab RustFS
   (e.g. `vps-backups`) with its own key. Add a Dokploy destination for it on
   the VPS over Tailscale, the same way as `church-backups`.
2. Repoint the two enabled backups (grocerify, directus) to that destination.
   Repoint Church's `staging/pre-deployment` backup to `church-backups`, and
   check it with `bun run backup:check`.
3. Copy the backup history you want to keep from MinIO to the homelab, for
   example with `rclone sync minio:backups homelab:vps-backups`, or let
   Dokploy's retention rebuild it. Only ~216 MiB is involved.
4. Delete `loki-church` and `temp-files`, then stop and delete the `minio`
   compose and its volume. That frees the two domains and the RAM MinIO uses.
   Delete the `Backup` destination.

RustFS also has *on-demand migration*, which lazily pulls objects from an
S3 source on a missed GET ([docs/operations/on-demand-migration.md](https://github.com/rustfs/rustfs/blob/main/docs/operations/on-demand-migration.md)).
It is not needed here, because no app data moves to the new RustFS.

## 2. Deploying RustFS on Dokploy

Base it on the homelab compose (`Infra/rustfs`, image `rustfs/rustfs:1.0.5`),
which already works. Make these changes:

```yaml
services:
  rustfs:
    image: rustfs/rustfs:1.0.6        # latest release, 2026-11-15; pin, never :latest
    restart: unless-stopped
    environment:
      RUSTFS_VOLUMES: /data
      RUSTFS_ADDRESS: ":9000"
      RUSTFS_CONSOLE_ADDRESS: ":9001"
      RUSTFS_CONSOLE_ENABLE: "true"
      RUSTFS_ACCESS_KEY: ${RUSTFS_ACCESS_KEY}
      RUSTFS_SECRET_KEY: ${RUSTFS_SECRET_KEY}
    volumes:
      - rustfs-data:/data             # named volume, not a bind mount
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:9000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks: [dokploy-network]
    # no `ports:` — Traefik reaches it on dokploy-network
volumes:
  rustfs-data:
networks:
  dokploy-network:
    external: true
```

- **Image and user.** The container runs as `rustfs`, UID/GID `10001:10001`.
  A bind mount must be `chown 10001:10001` or startup fails
  ([README](https://github.com/rustfs/rustfs#readme)). The upstream compose
  ([docker-compose.yml](https://github.com/rustfs/rustfs/blob/main/docker-compose.yml))
  shows the env names above and a `/health` check on port 9000. Its default
  keys (`rustfsadmin`) are public, so always set your own.
- **Volume.** Dokploy recommends named volumes for data. Its *Volume Backups*
  work only with named volumes, and `../files` bind mounts are lost when the
  app is deleted ([Dokploy Compose docs](https://docs.dokploy.com/docs/core/docker-compose)).
  On the first deploy, check that the fresh named volume is writable by UID
  10001.
- **Domain and TLS.** Use Dokploy's Domains tab. At deploy time it adds
  Traefik labels and `dokploy-network`
  ([Dokploy compose domains](https://docs.dokploy.com/docs/core/docker-compose/domains)).
  Reuse `storage.lunalabs.com.br` → service `rustfs`, port 9000, Let's
  Encrypt, once MinIO is gone. Do not publish host ports. The current
  `9000:9000` on MinIO is the exposure to remove. The console
  (`console-storage.lunalabs.com.br` → 9001) is better kept off the public
  internet, either through the tailnet only or by enabling it only while you
  administer.
- **Reverse proxy.** RustFS closes idle keep-alive connections after
  `RUSTFS_HTTP1_HEADER_READ_TIMEOUT` (default 75 s). If the proxy keeps
  upstream connections idle for longer, large PUTs fail with `socket hang up`
  ([reverse-proxy.md](https://github.com/rustfs/rustfs/blob/main/docs/operations/reverse-proxy.md)).
  Keep Traefik's upstream idle timeout below RustFS's, or raise the RustFS
  value. Check this with a multi-MiB upload through the domain when
  provisioning.
- **Tenancy inside RustFS.** Create one bucket per Church environment
  (`church-staging`, `church-production`, `church-development`). Give each its
  own access key, with a policy limited to that bucket. The root key is for
  administration only. Bucket policies, public access block and presigned
  GET/PUT are listed as supported in the
  [S3 compatibility matrix](https://github.com/rustfs/rustfs/blob/main/docs/architecture/s3-compatibility-matrix.md).
- **Backups of app files.** Back the `rustfs-data` volume up to the homelab
  RustFS with a Dokploy Volume Backup, or run `rclone sync` per bucket.
  Holding *backups* is exactly the homelab RustFS's role. The production
  restore exercise should include files, not only the database.

## 3. How the app reads (and writes) files

**Email needs a URL that keeps working.** The image URL is fixed into each
message when it is sent, and the recipient's client (or Gmail's image proxy)
fetches it later, possibly weeks later.

| Option | Verdict |
| --- | --- |
| **Presigned GET** | Rejected for logos. A SigV4 presigned URL lasts at most **7 days**, and less if signed with temporary credentials ([AWS: presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)). Images in older emails would break. Each render also produces a new URL, which defeats caching. Keep it for future *private* files (attachments) shown inside the app. |
| **Proxy through Fastify** (`GET /api/files/...`) | Works and gives an app-owned URL. But every image load costs server work and a route exempt from auth, and logos are not secret. Only worth it if access control is ever needed. |
| **Public-read objects** | **Recommended for logos.** Add a bucket policy that grants anonymous `s3:GetObject` on `arn:aws:s3:::church-<env>/public/*` only, with no `s3:ListBucket`, so objects can be fetched but not listed. RustFS checks anonymous requests against the bucket policy ([static-website-hosting.md](https://github.com/rustfs/rustfs/blob/main/docs/operations/static-website-hosting.md)). |

Details for public objects:

- Use immutable keys such as
  `public/churches/<churchId>/logo/<sha256>.png`. Replacing a logo writes a
  new key and deletes the old one *later*, if ever, because emails already
  sent still point at it. Set `Cache-Control: public, max-age=31536000, immutable`
  on upload.
- The database stores the **key**, never a full URL. The server builds the
  URL as `${STORAGE_PUBLIC_URL}/${key}`. Moving hosts then means changing one
  setting and copying the bucket. Old emails keep the old host, so
  `STORAGE_PUBLIC_URL` should be a hostname you will keep. Two choices for the
  spec: the storage domain directly, or the app origin through a `/files/`
  location in the web nginx that proxies to the bucket, which gives
  app-owned, host-independent URLs.
- Store only raster logos (PNG, JPEG, WebP). SVG served from your own domain
  can carry script, and Gmail rasterizes SVG while other email clients'
  support varies ([caniemail: SVG](https://www.caniemail.com/features/image-svg/)).

**Writes.** Send the file to Fastify with `@fastify/multipart` (an official
plugin, not installed yet). The server checks the ChurchAdmin, the size (for
example ≤ 2 MiB) and the real type from the file's magic bytes, then calls
`PutObject`. This keeps validation at the trust boundary and needs no bucket
CORS. A presigned PUT straight from the browser also works on RustFS, which
can cap upload size with a signed query parameter
([presigned-size-limits.md](https://github.com/rustfs/rustfs/blob/main/docs/operations/presigned-size-limits.md)).
It needs CORS and a confirmation step, which is not worth it for small
logos. Avoid browser POST-policy uploads: "POST Object form upload checksum
handling" is listed as *not yet passing* in the compatibility matrix.

## 4. S3 client for the server

Use **`@aws-sdk/client-s3`** (AWS SDK for JavaScript v3). Add
`@aws-sdk/s3-request-presigner` only when private files arrive.

```ts
new S3Client({
  endpoint: env.S3_ENDPOINT,     // e.g. https://storage.lunalabs.com.br
  region: env.S3_REGION,         // 'us-east-1'; RustFS ignores it but SigV4 needs one
  forcePathStyle: true,          // bucket in the path, no wildcard DNS needed
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});
```

- **Nothing is installed today.** `apps/server/package.json` has no S3 or
  multipart dependency.
- **Why not `Bun.S3Client`.** The deployed server runs on Bun
  (`start:deployment`), but `dev` and `start:e2e` run it on Node through
  `tsx`, and the tests run under Vitest. A Bun-only client would fail in
  those environments. The AWS SDK runs on both and is portable to any
  S3-compatible host.
- **Checksums.** Recent v3 versions add a CRC32 checksum to uploads by
  default (`requestChecksumCalculation` / `responseChecksumValidation` =
  `WHEN_SUPPORTED`) ([AWS SDK data integrity](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html)).
  RustFS supports checksum algorithms including CRC32 (compatibility matrix),
  so keep the defaults. If a PUT fails on checksum errors, set both to
  `WHEN_REQUIRED`, the usual setting for third-party S3 stores.
- **Env contract.** Add `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID` (secret), `S3_SECRET_ACCESS_KEY` (secret) and
  `STORAGE_PUBLIC_URL` to `packages/env/src/server.ts`, and pass them through
  `deployment/compose.yml` with `:?` guards like the existing variables.

## 5. Development and local environments

**Deployed development (homelab `products/church-development`, public at
`church-dev.lunalabs.duckdns.org`).** Use bucket `church-development` with
its own key on the **VPS** RustFS. Its emails go to Mailpit, but the logo
URLs must still load in a browser, and the VPS RustFS is public. The homelab
RustFS stays for backups only. A separate RustFS container in the dev compose
would also work, but it is one more service to run, and it would not test
the real storage setup. `environment:reset` should empty the bucket together
with the database.

**Local and worktrees.** Today the root `docker-compose.yml` (project
`church`) runs `db` and `mailpit` for every worktree, and each worktree gets
its own databases (`church_<worktree>_*`, ADR 0005). Storage can follow the
same pattern:

- Add a `storage` service with `rustfs/rustfs:1.0.6`, a named volume, and
  host ports that do not clash with anything else (e.g. `9200:9000`, console
  `9201:9001`). Use fixed local-only keys, like the Postgres defaults there.
  `db:start` starts it.
- `db:bootstrap` creates bucket `church-<worktree>` and applies the
  `public/*` read policy. `db:prune` deletes it. The generated `.env.local`
  gets `S3_ENDPOINT=http://localhost:9200`, `S3_BUCKET=church-<worktree>` and
  `STORAGE_PUBLIC_URL=http://localhost:9200/church-<worktree>`.
- Integration and E2E tests use their own bucket on the same local RustFS, as
  they use their own databases. Unit tests use a fake behind the storage
  port. CI needs the same service next to Postgres.

## Open risks

- **VPS memory.** About 1.3 GB was free on 2026-11-17 (ADR 0015).
  Replacing MinIO with RustFS should be roughly neutral, but measure it after
  the switch.
- **RustFS maturity.** Releases arrive weekly (1.0.2 → 1.0.6 between
  2026-10-16 and 2026-11-15), and the repo tracks security advisories in
  `docs/testing/security-regressions.md`. Pin the image, update on purpose,
  and keep the anonymous policy limited to `public/*`.
- **Email URL permanence.** Any later change to `STORAGE_PUBLIC_URL`, or
  deleting a replaced logo, breaks images in emails already sent. Decide the
  hostname once.
- **Not verified live:** named-volume ownership for UID 10001, Traefik's
  idle timeout compared with RustFS's 75 s, and an anonymous GET through
  Traefik. Check all three while provisioning (map task "Provision shared
  RustFS on the VPS").
- **Church staging backup misconfiguration** (section 1) exists today,
  whatever happens to storage.
