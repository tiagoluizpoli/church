# Signed-in acceptance binds to the reviewed invitation bundle

## Status

accepted

## Context

A Church offer can carry several Ministry Invitations, and one signed-in acceptance grants all of them with the Church Access Level ([#847](https://github.com/tiagoluizpoli/church/issues/847)). Between review and submit an admin can add, revoke, upgrade or let a half expire. Before this decision, acceptance granted whatever was pending at submit, and the Church half committed in a transaction separate from the Ministry halves, so a stale or failed acceptance could leave a partial grant.

## Decision

- **The bundle.** One signed-in acceptance of a Ministry Invitation grants its bundle: for a chained invitation, its Church Invitation while still pending (the Church Access Level) and every pending, unexpired Ministry half of that Church Invitation; for a standalone Ministry invitation, that invitation alone. Any half shows the same bundle. `MinistryInvitationRepository.findRedemptionBundle` reads it.
- **The review token.** The authenticated status (`GET /redemption/ministry/:id`) returns the bundle and a `reviewToken`: a SHA-256 fingerprint (`reviewTokenFor`) of the Church Access Level being granted and, per half, its id, Ministry, Ministry Access Level, Role ids and expiry. Names are display only and stay out of it.
- **Acceptance.** `POST /redemption/ministry/:id/accept` requires the `reviewToken`. In one transaction it takes the shared invitation lock order (every half's Ministry, then the Church Invitation row, then the halves), re-reads the bundle, and refuses with `{ kind: 'offer-changed' }` when the token differs; nothing is granted. Otherwise it accepts the Church half and grants every Ministry half in that same transaction.
- **Fresh review.** The client refetches the status after `offer-changed` and needs another explicit acceptance, even when the bundle only shrank. An unusable invitation reads as unavailable.
- **Kept rules.** The identity check and already-accepted retry run before the token check; a duplicate submit that waited on the first one's locks also answers already-accepted. A Cross-Church Volunteer conflict still commits the Church half alone (spec §7.5) and leads to Volunteer Transfer. Decline is unchanged.

## Considered Options

- **Echo the reviewed grant list and compare field by field.** Rejected: the client would send every fact back, and the server must still read the same rows under lock to compare them.
- **A version counter on the Church Invitation.** Rejected: expiry and Ministry-only changes do not touch that row, so each lifecycle write would also have to bump it.
- **Client-only refetch before submit.** Rejected by #847: a change between refetch and commit would still grant unreviewed access.

## Consequences

- A resend that extends expiry also asks for a fresh review.
- The new-person join through the public Church link is not bound to a token; it verifies by code and grants the pending bundle at submit.
- A plain Church Invitation (no Ministry half) addressed to an account that already exists still has no signed-in acceptance path.
