# Notifications reach Church Members through sinks; Transactional emails go to addresses

## Status

accepted

## Context

Messages had two unrelated paths: the bell wrote finished English text straight into `volunteer_notification`, keyed by Volunteer, outside any outbox; emails went through the outbox, one row per email, with English HTML inline in the sender. Leaders and ChurchAdmins now receive notices too, every notice ships in EN + pt-BR, and invitations reach people who are not members yet. Decided in the MVP Journeys map ticket [Notification system: core, sinks and recipient lookup](https://github.com/tiagoluizpoli/church/issues/399).

## Decision

- **Two kinds of message, split by who they are addressed to.** A **Notification** is addressed to a Church Member (a User inside one Church): it reaches the bell and, per kind, email. A **Transactional email** is addressed to an email address, member or not (an Invitation to someone new, a verification code, a password reset): no bell, and it never passes through the notification core. Both share the outbox, the drainer and the i18n email templates.
- **A generic core with sinks.** `Notifier<TRecipient>.send({ to, kind, data })` lives in `apps/server` with no church concepts, so it can later move to a package. The app fixes the recipient as `{ userId, churchId }`; new fields are optional. Each sink (email, inbox) is registered at startup with its own address lookup and per-kind text; a sink missing either skips that recipient and logs it. Sinks are switched on or off in the central config.
- **Members only, checked at delivery.** Every lookup finds the person inside `churchId`, so someone outside the Church, or who left after the change, receives nothing on any channel.
- **One outbox row per recipient, written with the change.** Church code calls `notifications.enqueue({ tx, kind, to, data })` in the change's transaction; recipient rules (who gets notified) live in the church layer and dedupe by User. The drainer hands each row to the core. A retry replays the whole row, so every sink is idempotent on the row id (unique key on the bell row, provider idempotency key on email).
- **The bell stores kind + data, not text.** Names and dates are frozen at delivery; the web renders the words from the shared catalog in the viewer's language.

## Considered Options

- **One path, with an optional email on the recipient.** Rejected: it breaks the guarantee that a Notification can never reach a non-member, and an invitation has no bell to reach.
- **One outbox row per change, recipients resolved at drain time.** Rejected: the recipient list drifts after the change (a leader added later gets told), and one failing address retries everyone.
- **Server-rendered bell text, as before.** Rejected: stored text freezes the language and duplicates what the detail sheet needs as data anyway.

## Consequences

- The bell shows a Notification within one drain tick, not instantly.
- A member-facing email no Flow needs is still a Notification (the Volunteer Transfer digests move onto the core as email-only); it never goes back to a direct send.
