# Assignment proposal Apply binds the reviewed pairs and stores its outcome

## Status

accepted ([#873](https://github.com/tiagoluizpoli/church/issues/873)); builds on [ADR 0012](0012-assignment-proposals-are-stateless-previews-of-explicit-additions.md) and follows the token pattern of [ADR 0011](0011-signed-in-acceptance-binds-to-the-reviewed-bundle.md)

## Context

[#855](https://github.com/tiagoluizpoli/church/issues/855) requires Apply to create exactly the reviewed additions once and atomically. A stale preview writes nothing and needs a fresh review. A double click, a replay, or a retry after a lost response must return the committed outcome and never add Assignments a second time. ADR 0012 keeps the preview stateless and leaves the binding and the recovery mechanism to this ticket.

## Decision

- **Review token.** The preview response carries a `reviewToken`: a SHA-256 fingerprint (`proposalReviewTokenFor`) of the Cycle, the Ministry and the sorted `(shiftRequirementId, volunteerId)` pairs. Apply sends the pairs and the token back. When the token does not match the submitted pairs and scope, Apply refuses with `ASSIGNMENT_PROPOSAL_CHANGED` and writes nothing. Like ADR 0011, the token is a fingerprint and not a signature. It catches added, dropped or edited pairs. Anyone who forges one still needs manual-assignment authority, and every pair still has to pass eligibility.
- **Application key.** The web creates one random `applicationKey` (a UUID) for each preview it shows, and resends it on every retry of that preview. `assignment_proposal_application` stores one row per committed Apply under the primary key `(church_id, application_key)`. The row holds the Cycle, the Ministry, the review token, the actor, `applied_at` and the outcome: each created Assignment id with its pair.
- **Order inside one transaction.** Apply first checks the token against the submitted pairs, on every attempt including replays. It then takes the Church lock, the same lock manual Assignment creation takes, and:
  1. Reads the key. If a row exists for the same token, Cycle and Ministry, Apply returns the stored outcome with `replayed: true` and runs no other check. If the row holds anything else, Apply refuses with `ASSIGNMENT_PROPOSAL_CHANGED`.
  2. Takes the Schedule lock order (`lockSchedule`) and requires availability requested or assigning (`SCHEDULE_ALREADY_PUBLISHED` or `ILLEGAL_STATE_TRANSITION`).
  3. Reloads the preview facts and runs `findStaleAdditions`, which applies the proposal's mandatory eligibility rules in submission order: open Shift, remaining headcount, confirmed availability, Role, not unavailable, no same-Shift or overlapping booking in any Ministry, and no conflict with earlier pairs. Ranking is not rechecked. Any stale pair refuses the whole Apply with `ASSIGNMENT_PROPOSAL_STALE`.
  4. Creates `pending` Assignments with `created` audits whose `correlationId` is the application key. It moves availability requested to assigning, as manual creation does. It stores the outcome row.
- **Concurrency.** A double click or an early retry waits on the Church lock. It then finds the committed row and returns its outcome. If the first attempt rolled back, no row exists and the retry is validated again. Two Applies with different keys, and Apply against a manual Assignment, serialize on the Church lock. The later writer sees the committed Assignments and goes stale or refuses.
- **Authority and tenancy.** Every request, including a recovery retry, needs the builder's `decideManageMinistry` authority. Keys are scoped by Church, so a key from another Church is never found or recovered.
- **No side effects beyond Assignments.** Apply does not publish and does not notify. Existing Assignments are kept. Later edits go through the builder, and a new proposal fills the remaining gaps.

## Considered Options

- **Store every preview and apply it by id.** Rejected: it gives each preview a lifecycle and needs cleanup, although the pairs plus the token already identify what was reviewed.
- **Keep the outcome only in audit `correlationId`.** Rejected: an Assignment that is deleted later loses its pair, and the scope and token needed to reject an altered replay would be gone.
- **A signed (HMAC) token.** Rejected: the actor already holds manual-assignment authority, so a signature adds a secret to manage and guards no extra permission.

## Consequences

- A retry always gets the original outcome, even after the Schedule has been published or the pairs have gone stale.
- A reloaded page loses its key. The builder already shows the committed Assignments, and a new preview leaves out the needs they fill.
- Outcome rows are kept with the Church and are never pruned.
