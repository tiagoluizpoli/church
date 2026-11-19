# Alerting

Where alerts go and what watches the deployed environments from outside.
Decisions: [ADR 0015](../adr/0015-self-hosted-observability-on-the-homelab.md).
Every alert reaches the maintainer's phone twice: through Telegram and
through ntfy. Only production alerts. Staging is watched for downtime only.

Everything here runs on the VPS, in the Dokploy compose **observability**
(Products project), built from
[deployment/observability/compose.yml](../../deployment/observability/compose.yml).
The error tracker, logs and Grafana live on the homelab
([#920](https://github.com/tiagoluizpoli/church/issues/920)). Their alert
rules are [#923](https://github.com/tiagoluizpoli/church/issues/923).

| Piece | Where | Reached from |
| --- | --- | --- |
| ntfy | `https://ntfy.lunalabs.com.br` | public, login required |
| Uptime Kuma | `http://100.119.105.21:3002` | tailnet only |
| GlitchTip → Telegram relay | n8n workflow *Church alerts: GlitchTip to Telegram* | public webhook with a secret path |
| Telegram bot | `@lunalabs_n8n_bot`, posting to the group *church-updates* | Telegram |

Secrets (the ntfy logins and token, the Telegram bot token, the webhook path)
are kept in the password manager, in Dokploy and in n8n credentials. They never
go in this repository.

## ntfy

- Default access is `deny-all`. Users, ACL and tokens are declared in the
  Dokploy environment (`NTFY_AUTH_USERS`, `NTFY_AUTH_ACCESS`,
  `NTFY_AUTH_TOKENS`) and applied at every start. Values are single-quoted:
  bcrypt hashes contain `$`, and `$$` escaping crash-loops the container.
- Users: `tiago` (admin; the phone and web app log in with it) and `alerts`
  (write-only on `alerts-*`). Alert sources publish with the `alerts`
  user's token, never with a password.
- Topics, one per severity: `alerts-critical` (down, new error, spike) and
  `alerts-warning`.
- Phone: the ntfy Android app, server `https://ntfy.lunalabs.com.br`, logged in
  as `tiago`, subscribed to both topics. It gets messages straight from our
  server (no `upstream-base-url`, no ntfy.sh relay).

Rotate a password: `docker run --rm -it binwiederhier/ntfy user hash`, replace
the hash in `NTFY_AUTH_USERS`, redeploy. Rotate the token: generate a new
`tk_` + 29 lowercase alphanumerics (`ntfy token generate`), replace it in
`NTFY_AUTH_TOKENS`, redeploy, and update every publisher (Uptime Kuma,
GlitchTip, Grafana).

Test:

```sh
curl -H "Authorization: Bearer $NTFY_TOKEN" -H "Title: test" -d "hello" \
  https://ntfy.lunalabs.com.br/alerts-critical
```

## Telegram and the n8n relay

GlitchTip has no Telegram integration. Its *webhook* alert recipient posts a
Slack-style payload (`text` plus `attachments` with title, link and fields) to
the n8n workflow, which sends one Telegram message per alert. The webhook URL
must be the public `https://n8n.lunalabs.com.br/webhook/<secret path>`:
GlitchTip refuses webhook URLs that resolve to private addresses.

The bot token is the n8n credential *Church alerts bot*. The chat id of
*church-updates* is in the workflow's Telegram node. To find a chat id, send a
message in the chat and read `https://api.telegram.org/bot<token>/getUpdates`. Uptime Kuma (and later Grafana) talk to Telegram
directly with the same bot token and chat id.

Test the relay:

```sh
curl -H 'content-type: application/json' \
  -d '{"text":"GlitchTip Alert","attachments":[{"title":"Test issue","text":"relay test","title_link":"https://example.invalid","fields":[{"title":"Environment","value":"production"}]}]}' \
  https://n8n.lunalabs.com.br/webhook/<secret path>
```

## Uptime Kuma

The outside watchdog. It keeps reporting downtime when the homelab, and with
it the rest of the observability stack, is offline.

- UI over the tailnet only, port `3002`. Kuma uses host networking and listens
  on the VPS tailnet address only (`UPTIME_KUMA_HOST`). A published Docker port
  would not work: on the VPS, iptables `FORWARD` drops tailnet traffic to new
  compose networks (ufw is inactive there, so ufw rules change nothing).
- Admin login: user `tiago`, password in the password manager. Storage is SQLite
  in the `uptime-kuma-data` volume.
- Notifications: *Telegram* (bot token, chat id) and *ntfy*
  (`https://ntfy.lunalabs.com.br`, topic `alerts-critical`, the `alerts`
  token), both applied to every monitor.

| Monitor | Check | Notes |
| --- | --- | --- |
| church staging | `https://church-staging.lunalabs.com.br/api/health`, keyword `"status":"ok"` | |
| church production | `https://church.lunalabs.com.br/api/health`, keyword `"status":"ok"` | paused until production is deployed |
| n8n | `https://n8n.lunalabs.com.br/healthz` | the Telegram relay |
| ntfy | `https://ntfy.lunalabs.com.br/v1/health` | |
| homelab Grafana | Grafana's tailnet URL, `/api/health` | added with [#920](https://github.com/tiagoluizpoli/church/issues/920) |

Checks run every 60 s and alert after 3 failures, then repeat at most every
hour while down, so an outage sends one alert per monitor, not one per check.

Test: stop the staging compose in Dokploy. A *down* alert arrives on both
channels within about 3 minutes. Start it again, and an *up* alert follows.
