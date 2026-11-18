# Assignment proposals are stateless previews of explicit additions

## Status

accepted (preview, [#872](https://github.com/tiagoluizpoli/church/issues/872)); application is decided by [ADR 0013](0013-assignment-proposal-apply-binds-reviewed-pairs-with-a-stored-outcome.md) ([#873](https://github.com/tiagoluizpoli/church/issues/873)) within the constraints below

## Context

A leader may ask for an Assignment proposal for one Schedule between asking for availability and publishing ([#855](https://github.com/tiagoluizpoli/church/issues/855)). Generation and Discard must write nothing. A later Apply must create exactly the reviewed additions once, reject a stale preview without partial writes, and never silently substitute a newly generated proposal. The preview ships before Apply, so its contract has to leave room for that application.

## Decision

- **Computation.** `proposeAssignments` (`apps/server/src/domain/services/assignment-proposal.ts`) is a pure function over scheduling facts: named eligibility rules, then the `VOLUNTEER_RANKING` and `NEED_RANKING` lists, recomputed after every addition. Ids order ties by code unit, so the result does not depend on database row order.
- **Preview read.** `GET /assign/cycles/:cycleId/assignment-proposal?ministryId=` loads the facts, takes no locks, and stores nothing. It needs the builder's `decideManageMinistry` authority and refuses outside availability requested/assigning (`ILLEGAL_STATE_TRANSITION`, or `SCHEDULE_ALREADY_PUBLISHED`).
- **Explicit additions.** The response lists every addition as a `(shiftRequirementId, volunteerId)` pair, plus `shiftId`, the volunteer's name and a reason. Reasons are counts and the name of the deciding ranking rule. They never name another Ministry, Event or Assignment, even though conflicts and Cycle workload use them.
- **No stored proposal.** There is no proposal id or stored row. The response carries a `reviewToken` fingerprint of its pairs (ADR 0013). The web keeps the response in memory, and Discard drops it.

## Constraints for application (#873)

- Apply submits the reviewed pairs back, not a regeneration request. It revalidates each pair inside one transaction under the existing Church lock, then the Schedule lock order. A pair that no longer passes the mandatory eligibility rules rejects the whole apply. Ranking policy is not rechecked, so unrelated changes do not invalidate a preview.
- #873 chooses the idempotency/outcome-recovery mechanism (for example a client-generated key stored with the committed outcome) and any review fingerprint. Either one can be added to this response and request without changing the computation.

## Considered Options

- **Persist each proposal and apply it by id.** Deferred to #873: it adds storage and a lifecycle before Apply exists. The explicit pairs already allow exact application.
- **Apply by regenerating on the server.** Rejected by #855: the result could differ from what the leader reviewed.

## Consequences

- Two previews of the same inputs are identical. A preview can still go stale once facts change or a Shift starts; Apply then refuses it and asks for a fresh review (ADR 0013).
