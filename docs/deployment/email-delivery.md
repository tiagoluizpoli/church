# Email delivery in development and staging

Development and staging decide per email whether it goes to the private
Mailpit inbox, to real recipients through Resend, or to both. Production
ignores this and always sends through Resend.

## How it is selected

- `CHURCH_ENVIRONMENT` (server env) chooses the sender. `development` and
  `staging` use the database delivery mode; `production` always uses Resend;
  `local` (the default) keeps the local `DEV_EMAIL_SENDER` behaviour, and
  tests always capture.
- The mode is the row `email_delivery_mode` in `runtime_configuration`, a
  JSON string: `"mailpit"`, `"resend"` or `"both"`.
- A missing row or any other value delivers to Mailpit only and logs
  `email_delivery_mode is missing or not one of ...` (the value itself is
  never logged).
- There is no settings page, cache or restart: the next email reads the row.

## Changing the mode

Connect to the environment's own database (never production's) and run:

```sql
INSERT INTO runtime_configuration (code, value)
VALUES ('email_delivery_mode', '"both"')
ON CONFLICT (code) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Check it with `SELECT value FROM runtime_configuration WHERE code =
'email_delivery_mode';`. Delete the row to return to Mailpit only.

## What a change affects

- Each email keeps the mode it was created with. Queued outbox email freezes
  the mode in the same insert that queues it; direct email (password reset,
  verification code) reads it when sent. Switching to `resend` never sends
  an older Mailpit-only backlog to real recipients, also across restarts.
- Rows queued before this feature existed have no frozen mode and go to
  Mailpit only.
- If the database cannot be read, queuing fails with the surrounding change
  and a direct email fails; nothing silently falls back to Mailpit.

## Retries in `both` mode

Mailpit and Resend confirm independently. The confirmed destination is
recorded on the outbox row at once; a retry sends only to the destination
that has not confirmed, with the row's same Resend idempotency key, so Resend
never delivers twice inside its retention window. SMTP has no idempotency:
after an uncertain Mailpit send (accepted, reply lost) the retry can capture
a duplicate. That is accepted. Direct email is not retried. There is no
recipient allowlist or daily cap: the mode alone controls real delivery.

## Mailpit

`deployment/compose.mailpit.yml` adds Mailpit to a development or staging
Compose deployment (`-f compose.yml -f compose.mailpit.yml`):

- SMTP is reachable only by the server on the project network.
- The inbox (port 8025) is published only on the host's Tailscale address,
  with no Dokploy domain, so only tailnet members can open it. Staging's
  application stays public; its captured mail does not.
- Messages older than seven days are deleted (`MP_MAX_AGE=7d`).

## Required configuration

| Variable | Where | Notes |
| --- | --- | --- |
| `CHURCH_ENVIRONMENT` | development, staging | `development` or `staging`; leave production unset or `production` |
| `MAILPIT_TAILSCALE_IP` | development, staging | the host's tailnet IPv4; the inbox binds only to it |
| `RESEND_API_KEY` (secret) | all deployed environments | required at startup, so switching to `resend` needs no restart |
| `RESEND_FROM_EMAIL` | all deployed environments | a Resend-verified sender; Mailpit copies use the same address |

Provisioning these values, the Tailscale membership and the Dokploy
applications is a separate infrastructure step.
