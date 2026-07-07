# Grilling Session: Planning Cycle Screen — Unlock, Scheduling Nav IA, Status Chips

Date: 2026-07-07
Status: complete — handoff written at .plan/handoffs/grill-to-prd-planning-cycle-lock-unlock-and-nav.md
Source Skill: grill-with-docs
Scope: `/scheduling/planning-cycles` admin screen only (planning cycles). Three tangled sub-topics from user testing feedback: (1) **[SUPERSEDED — see below]** locked cycles cannot currently be unlocked; (2) the Planning/Tailoring/Builder-events sub-nav under `/scheduling` is ambiguous (same-route jumps, unclear buttons, no URL change) — proposed fix is promoting Scheduling to a real parent route with role-gated nested child routes; (3) "locked" status is displayed redundantly in 3 places (header pill, selected-cycle-review row, calendar-review corner) and the header pill conflates cycle name + status + date range into one chip that should split. Tailoring and Builder-events screens explicitly deferred to a follow-up session — user wants planning screens fixed first.

**Pivot (this same session, later turn):** after seeing the spec/data-model conflicts a cycle-level unlock would introduce (see "Conflict-check" note below), the user replaced the whole "unlock the cycle" idea with a narrower mechanism: make individual calendar days/events editable in place (even while the cycle stays locked), gated behind admin-forced-override friction, which triggers a leader-acknowledgment step before a volunteer notification fires — scoped only to the volunteers actually affected by that specific change (e.g., only the last of 3 same-day services shifts time → only that service's assigned volunteers and that ministry's leader are involved, not the whole day/cycle). Explicit goal: keep MVP small, and soften/eliminate the spec conflicts already surfaced rather than accept them. Q-unlock-policy/Q-unlock-confirm-ux/Q-unlock-notify/Q-unlock-audit below are **superseded** by this pivot — kept in Answered Questions for audit trail, not as active decisions.

## Starting Context

- User prompt (paraphrased from a long voice-to-text message): reported three issues found while testing the planning screen, attached two screenshots (local dev + prod-like build) both showing `/scheduling` with Planning/Tailoring/Builder-events tabs, a `Julho 2026 [locked] 2026-07-01 → 2026-07-31` chip cluster top-right, a "Back to cycles / Template library / Create cycle" button row (circled red in screenshots), and a `Selected cycle review` card plus `Calendar review` section each showing their own "locked" badge.
- **Verbatim original prompt** (user asked this be preserved in full below the paraphrase, since the first pass may have compressed detail — copied as submitted, unedited):

  > /impeccable layout planning cicles
  >
  > Oh I'm gonna I'm going to start giving you things to fix related to this schedule and planning, tailoring and building events that I found testing let's start with:
  >
  > On planning when you lock a cycle, you cannot unlock it. I'm not sure if this was I don't remember if this was an intended decision, but I think we should be able to unlock it. To update you know it's important for the lead for the the admin or whatever church leader apostle or something to change the cycle if needed maybe he I don't know maybe he needs to add something maybe something is canceled so he needs to to cancel it I know that implies a lot of you know reI don't know notifications and all but even with some confirmation steps you know enforcing that it's not encouraged to unlock and already ongoing cycle the end word should be of the admin you know and of course I need to understand which are the implications regardless if you have something let's make a grill about this I think let's make a grill about this I think it's important
  >
  > Also this navigation view it's really weird I mean while we click along the screen we can jump between the lenning cycle then we can enter the template library then we can go back and I mean everything's on the under the same route you know it's weird it's a weird behavior and I don't like those buttons you know you have to read them really well to understand what is what what it's coming what's returning what is returning button what is the actually link to another session and the URL doesn't change so it makes us confused I think that also should change I don't know maybe maybe we should move them somewhere else in I don't know maybe change the how we think about this entirely you know I think probably we should I think that's a good idea actually we should turn the scheduling a parent and nest under it all the the screens you know that includes the planning cycles the tailoring the builder events I know they are related but they're not done by the same person for example the planning cycles are an admin page only admins can see it you know the tailoring and builder events are for the leaders the team leaders and subleaders the templates or also something for the admin to create the cycles and I'm not sure if you covered this already but we do have I think we sh if we don't we should have a template for the subleader to also lock how many things related to detailering you know how many slots I mean not slots sorry how many shifts a his lot should have based on the templates the tape the templates of the leader should be done using the I mean based on the admin global template i mean this is still for debate i don't think this is good for this MVP but I think it's something for us to at least think about it
  >
  > Also we have some like things that are in multiple basis for places for example this locked information we have them on the calendar review where the calendar dates are display we have them on the selected cycle review and we have it on the like the heater you know right next to the name of the cycle of the selects it I'm not even sure how this oh yeah when they selected cycle is I think by the way I'll I'll mark this I think this chip on the latest brin print screen the one that shows the name of this the planning cycle a chip or I don't know a peel saying locked and they start and end of the cycle I think it should be splitted in two the cycle name with the locket build to the side to the I mean not just lock it you know the the pill that said display the the status of the planning cycle it should be one and the period should be another I think that's important as well
  >
  > Well that's it for now. Let's start with those let's focus focus on these planning phase first planning screens first, and then we move to the tailoring after it.
  >
  > (Two screenshots attached, referenced above: local dev build and a prod-like build, both showing `/scheduling` with the Planning/Tailoring/Builder-events tab bar, the ambiguous button row circled in red, the combined name+status+period header chip, and the duplicated "locked"/"Locked" badges on `Selected cycle review` and `Calendar review`.)
- Relation to prior work: this repo already ran a broader grilling session at `.plan/grilling/2026-07-06-bl014-churchwide-ux-redesign.md` (BL-014, church-wide IA) covering the same `/scheduling/planning` screen at a higher altitude (decided: turn the 4-card grid into a guided step sequence — `CreateCycleCard` step 1, `TemplateManagerCard`+`CycleReviewCard` steps 2-3, `CycleListCard` demoted to sidebar/history). That session is answered-out and awaiting explicit user sign-off before PRD handoff; it did **not** cover cycle unlock semantics or the nested-route/role-split navigation model — those are new decisions raised in this session. Any implementation should treat that session's step-sequence decision as already-settled background, not re-litigate it here.
- Codebase verification done directly before asking anything (per skill: explore before grilling):
  - **State machine** (`apps/server/src/domain/entities/planning-cycle.ts`): `PlanningCycleState = 'draft' | 'locked' | 'archived'`. `lock()` only allows `draft -> locked` (throws `IllegalStateTransitionError` otherwise). There is **no** `unlock()` or `reopen()` method on the cycle entity itself — confirms this is a real gap, not something already half-built and hidden.
  - **Auto-archival is lazy and unconditional**: `db-planning-cycle-manager.ts` `ensureResolvedCycle()` silently flips `locked -> archived` on *any* read once `today >= cycle.endDate`, regardless of whether an explicit archive was ever called. This matters for unlock scope: a cycle whose end date has passed will already present as `archived` next time anyone loads it, so "unlock" can only ever be meaningful for a `locked` cycle that is still current/future.
  - **Locking's real effect**: locking a cycle is what flips its generated events from `draft` to `scheduled` (`db-planning-event-manager.ts`, `cycle.state === 'locked' ? 'scheduled' : 'draft'` in 3 places) — `scheduled` is what makes an event visible/staffable to leaders in Tailoring. So "locked" isn't just a cosmetic flag, it's the publish gate for the leader-facing side of the product.
  - **A narrower reopen already exists**: `IPlanningCycleManager.reopenEvent()` flips a *single* event `scheduled -> draft`, but only when `cycle.assertCanReopenEvent()` passes — which requires `cycle.state === 'locked'` (i.e. you can only reopen individual events *while the cycle stays locked*) and blocks if the event is `cancelled` or `past`. So today's model already anticipated "admin needs to walk back one scheduled event" and deliberately scoped it to event-level, not cycle-level — this is the precedent an unlock feature should either extend or explicitly override.
  - **No cascade to staffing found**: neither `reopenEvent` nor `lockCycle` touch `MinistryParticipation`/`Shift` assignment records — they only flip `Event.status`. So whatever "unlock" ends up doing, existing volunteer sign-ups tied to already-`scheduled` events are not automatically cleaned up by any existing code path; that's an open risk surface, not a solved one.
  - **Nav/IA**: `apps/web/src/routes/scheduling.tsx` (parent, has the Planning/Tailoring/Builder-events tab bar) with children rendering everything client-side under one URL — confirmed from screenshots showing identical route context for both tab-content and the "Back to cycles / Template library / Create cycle" in-page buttons. No file-based nested routes per tab were found under a quick check; this is consistent with the user's complaint that the URL never changes.
    - **Correction (found during `/speckit-plan`, see `specs/018-churchwide-ux-redesign/research.md` R6)**: this was wrong. `/scheduling/planning`, `/scheduling/tailoring`, and the bare `/scheduling` index already are 3 distinct file routes wired by `<Link>` (`scheduling-nav.tsx`) — the top-level tabs already change the URL. The part of the complaint that's actually accurate is narrower: `planning-admin.tsx`'s internal "Back to cycles/Template library/Create cycle" row is `useState`-driven (`activeView`, `selectedCycleId`), never reflected in the URL. FR-015/FR-016 and Phase 8's tasks were corrected accordingly (role guards + `planning-cycles` rename + `builder-events` path + promoting that internal state to URL segments — not building nested routing from scratch).
  - **Duplicate "locked" indicator confirmed**: `planning-admin.utils.ts:194` and `:252` and `planning-admin-context.tsx:60` all branch on `cycle.state === 'locked'` independently to render badges in 3 different components (header cluster, `CycleReviewCard`, calendar-review section) — no single shared status-badge component today.
- Parking lot (explicitly not for this MVP per user, noted for later — not a queued question): a possible future "sub-leader template" that would let a sub-leader define how many shifts their slot needs, constrained by the admin's global/leader template. User flagged this as worth remembering but deliberately out of scope now.
- **Conflict-check that triggered the pivot**: before this pivot, cross-checking against `specs/018-churchwide-ux-redesign/` surfaced 4 conflicts with the cycle-level unlock design (Q-unlock-policy et al.): (1) spec.md's Edge Cases section already states a locked cycle's planning-step-sequence is "read-only, not editable" — and this is **already shipped and tested** (`tasks.md` T038/T046, `PlanningStep` → `locked-review` = read-only, all checked off); (2) spec.md + data-model.md both explicitly say this feature "introduces no new domain entities" — a cycle-level audit trail would break that; (3) FR-002 only specifies one flat `Scheduling` nav entry, coarser than the nested-route decision already made in this session; (4) no FR at all covers an unlock/reopen-cycle action. 018's tasks.md is 51/56 checked off — i.e. this is a spec/code that's essentially already shipped, not pre-implementation.
- **How the day-level pivot changes that conflict picture** (checked directly against the code, not assumed):
  - Conflict (1) is **substantially softened, maybe avoided**: the shipped "locked → read-only" invariant lives specifically in `PlanningStep`/`usePlanningStep()` — the planning-cycle screen's own step-sequence UI. A per-day/per-event edit affordance does not need to touch `PlanningCycle.state`, `PlanningStep`, or that already-tested read-only rendering at all — the cycle stays `locked`, the step sequence stays in `locked-review`, exactly as shipped. What *does* need to change is a narrower, lower-level guard: `db-planning-event-manager.ts`'s `updateEvent()`/`cancelEvent()` currently hard-block (`IllegalStateTransitionError`) any edit to a `scheduled` event while `cycle.state === 'locked'` — that guard needs an explicit, narrow override path for this new forced-edit action. Smaller surface than a cycle-level state transition.
  - Conflict (2) is **also softened, maybe avoided**: checked `apps/server/src/domain/entities/volunteer-notification.ts` and `ministry-volunteer.ts` directly. Leaders/sub-leaders are just `MinistryVolunteer` records with `systemRole: 'leader' | 'sub_leader'` — they hold a real `VolunteerId` like anyone else, so the *existing* `VolunteerNotification` entity (already supports a `volunteerId` target, a `type` enum that already includes `'assignment_changed'`, and a `readAt` timestamp) can address a leader directly without inventing a new "leader notification" concept. The only unresolved schema question is whether leader-acknowledgment ("okay, still workable, go ahead and notify volunteers") needs a new persisted field/flag distinct from generic `readAt`, or can be represented by extending `VolunteerNotification` itself (small field addition) rather than a wholly new entity — see Q-day-edit-ack-mechanism below.
  - Conflicts (3) and (4) are unrelated to this pivot and still stand as before (nav-split granularity vs. FR-002; no FR yet covers any admin-override editing action) — a spec amendment is still needed, just for this narrower feature instead of cycle-unlock.

## Current Question

_Batched per user's standing preference (5 independent questions, each with context/options/recommendation). All 5 concern the new day/event-level forced-edit + leader-ack + scoped-notify mechanism that replaces the cycle-unlock idea._

### Q-day-edit-scope
Exact question:
"What exactly can an admin edit on an already-`scheduled` (locked, staffed) event/day, under the new forced-override path?"

Options:
- **(a) Time-only** — start/end date-time of the event (and its `Shift`s shift accordingly). Matches the concrete example given (a service moved 1 hour later).
- **(b) Time + cancel** — (a) plus the ability to cancel a specific already-locked event/day outright (distinct action from editing its time). Matches the other concrete scenario mentioned ("maybe something is canceled").
- **(c) Full field parity with draft events** — time, title, description, location, and shift/headcount structure, all editable under the same forced-override gate.

Recommended answer:
- (b). Covers both concrete scenarios actually described (time shift, cancellation) without opening shift/headcount restructuring — that would force re-running staffing/generation logic against an already-staffed event, a much bigger and riskier surface than this MVP needs.

### Q-day-edit-mechanism
Exact question:
"How should the 'admin forced an edit through' state actually be modeled, given `updateEvent()`/`cancelEvent()` today hard-block any change to a `scheduled` event while the cycle is `locked`?"

Options:
- **(a) New event sub-status** — e.g. `scheduled_pending_review`: the event stays functionally `scheduled` (still counts as staffed) but carries a new persisted flag/timestamp the leader must clear.
- **(b) Reuse `reopenEvent`'s existing `scheduled -> draft` flip** — no new schema at all; the UI just treats "was scheduled, now draft" distinctly when it has prior assignments. Cheapest, but re-flips the event out of `scheduled` (i.e. off the leader's staffed view) the same way the already-existing tool does today, which may not match "leader can just check if it's still okay" (implies the event stays visibly staffed, just flagged for review).
- **(c) Separate lightweight acknowledgment record**, not on `Event` at all — `Event`/`Shift` fields update immediately when the admin forces the edit through; a small `EventChangeAcknowledgment`-style record (eventId, changed fields snapshot, leaderId, acknowledgedAt) exists purely to gate the downstream volunteer notification. `Event.status` never changes as part of this flow.

Recommended answer:
- (c). Keeps `Event.status`'s existing state machine completely untouched (so the shipped `locked-review` read-only behavior stays exactly as-is elsewhere), and the ack-gating concern is fully separable from "did the edit happen" — the edit and the notification-gate are two different questions with two different lifecycles.

### Q-day-edit-friction
Exact question:
"What does 'discouraged but overridable' actually look like in the UI when an admin tries to edit a locked/staffed day?"

Options:
- **(a) Plain confirm dialog** — "This day is already staffed. Editing will notify the leader for review before volunteers are told. Continue?" / Cancel / Continue.
- **(b) Two-step reveal** — a warning banner explains the consequence first; admin must explicitly click "I understand, edit anyway" to reveal the actual edit form, as a separate action from the edit itself.
- **(c) Typed confirmation** — admin types something (e.g. the event's date) before the edit form unlocks.

Recommended answer:
- (a). Matches the earlier decision on unlock-confirm friction (Q-unlock-confirm-ux, now superseded but the reasoning still applies): this is reversible-ish and leader-gated downstream, so heavy friction is disproportionate for an MVP explicitly meant to stay small.

### Q-notify-scope-granularity
Exact question:
"Precisely who counts as 'affected' and gets notified — this determines both which leader(s) get the first ack ping and which volunteers get the final notification?"

Options:
- **(a) Shift-level scope** — only volunteers with an active (non-declined/non-cancelled) assignment on the specific `Shift`(s) whose time actually changed, and only the leader(s) of ministries participating in those specific `Shift`(s). Matches the user's own example exactly (only the last of 3 same-day services changes → only that service's assigned volunteers + that ministry's leader).
- **(b) Event-level scope** — all volunteers assigned anywhere on that `Event` (the whole day's service block), even ones whose specific `Shift` didn't change. Simpler query (by `eventId` only) but notifies people the change doesn't actually affect.
- **(c) Ministry-serving-profile scope** — everyone enabled to serve that day/time per `MinistryServingProfile`, including volunteers not even staffed yet on this occurrence.

Recommended answer:
- (a). Directly matches the user's own worked example, stated twice, unprompted. Also the only option that avoids notification fatigue for the two-service-unaffected volunteers in that exact scenario.

### Q-leader-ack-gate-strength
Exact question:
"Is the leader's acknowledgment a hard gate — volunteers literally cannot be notified until the leader acks — or a softer, parallel notification?"

Options:
- **(a) Hard gate** — admin's forced edit sends the leader a notification/prompt first; the 'notify affected volunteers' action stays disabled/hidden until that specific leader acks that specific change.
- **(b) Soft gate** — leader is notified, but admin can also fire the volunteer notification directly without waiting, for urgent cases.
- **(c) No gate** — leader-notification and volunteer-notification fire simultaneously the moment the admin forces the edit through.

Recommended answer:
- (a). This is exactly how the flow was described, twice, with no hedging ("leader first... after leader just okay got it acknowledged then when he fires the update to the volunteers") — worth confirming explicitly since it's a real UI gate (a disabled action, not just an ordering suggestion), not a convenience toggle.

## Current Question

_None. Session complete — all 9 questions answered, handoff written to `.plan/handoffs/grill-to-prd-planning-cycle-lock-unlock-and-nav.md`._

## Future Questions

_None._

## Answered Questions

### Q-day-edit-scope
Exact question:
"What exactly can an admin edit on an already-`scheduled` (locked, staffed) event/day, under the new forced-override path?"

Options were:
- (a) Time-only.
- (b) Time + cancel.
- (c) Full field parity with draft events.

User answer:
"as recommended" (b)

Decision / takeaway:
- Forced-override path covers time edits (start/end, shifts follow) and outright cancellation of a locked day. No shift/headcount restructuring.

Queue impact:
- Bundling cancel alongside time-edit unblocked Q-cancel-pipeline (now in Current Question), since cancel's own pipeline behavior wasn't yet specified.

### Q-day-edit-mechanism
Exact question:
"How should the 'admin forced an edit through' state actually be modeled, given `updateEvent()`/`cancelEvent()` today hard-block any change to a `scheduled` event while the cycle is `locked`?"

Options were:
- (a) New event sub-status (`scheduled_pending_review`).
- (b) Reuse `reopenEvent`'s existing `scheduled -> draft` flip.
- (c) Separate lightweight acknowledgment record; `Event.status` never changes.

User answer:
"as recommended" (c)

Decision / takeaway:
- `Event`/`Shift` fields update immediately when the admin forces the edit through. A small ack record (eventId, changed-fields snapshot, leaderId, acknowledgedAt) exists purely to gate the downstream volunteer notification. `Event.status`'s existing state machine is untouched — this record doubles as the audit trail for this action (softens the earlier "no new domain entities" spec conflict to "one small new record," not a whole audit subsystem).

Queue impact:
- Unblocked Q-ack-vs-notify-action (now in Current Question) — the ack record's existence raises the question of whether acknowledging and notifying are one action or two.

### Q-day-edit-friction
Exact question:
"What does 'discouraged but overridable' actually look like in the UI when an admin tries to edit a locked/staffed day?"

Options were:
- (a) Plain confirm dialog.
- (b) Two-step reveal.
- (c) Typed confirmation.

User answer:
"as recommended" (a)

Decision / takeaway:
- A plain confirm dialog ("already staffed, editing will notify the leader for review before volunteers are told. Continue?") gates the edit. No typed input.

Queue impact:
- None — self-contained.

### Q-notify-scope-granularity
Exact question:
"Precisely who counts as 'affected' and gets notified?"

Options were:
- (a) Shift-level scope.
- (b) Event-level scope.
- (c) Ministry-serving-profile scope.

User answer:
"as recommended" (a)

Decision / takeaway:
- Only volunteers with an active assignment on the specific `Shift`(s) whose time changed, and only leaders of ministries participating in those shifts, are in scope for ack-ping and notification.

Queue impact:
- None — self-contained.

### Q-leader-ack-gate-strength
Exact question:
"Is the leader's acknowledgment a hard gate?"

Options were:
- (a) Hard gate.
- (b) Soft gate.
- (c) No gate.

User answer:
"as recommended" (a)

Decision / takeaway:
- The 'notify affected volunteers' action stays disabled/hidden until that specific leader acks that specific change.

Queue impact:
- Reinforces Q-ack-vs-notify-action (now in Current Question) — confirms ack and notify are distinct gated steps, but doesn't yet say whether they're one UI action or two.

### Q-cancel-pipeline
Exact question:
"Does the cancel-a-locked-day capability (bundled into Q-day-edit-scope's answer) go through the identical confirm -> leader-ack -> scoped-notify pipeline as a time-edit, or does it deviate?"

Options were:
- (a) Same pipeline.
- (b) Cancel skips the ack gate.
- (c) Cancel out of scope this pass.

User answer:
"as recommended" (a)

Decision / takeaway:
- Cancel-a-locked-day reuses the exact same confirm dialog, leader-ack gate, and shift-scoped notification chain as a time-edit. One mechanism covers both actions from Q-day-edit-scope.

Queue impact:
- None — self-contained. No further questions generated.

### Q-ack-vs-notify-action
Exact question:
"Is 'leader acknowledges the change' and 'leader fires the volunteer notification' one combined action, or two distinct steps?"

Options were:
- (a) Two separate actions.
- (b) One combined action.
- (c) Ack implicit/automatic, only notify explicit.

User answer:
"as recommended" (a)

Decision / takeaway:
- Two distinct leader-side actions: "Acknowledge" (clears the gate, notifies nobody) and a separate "Notify affected volunteers" action pressed when the leader is actually ready.

Queue impact:
- None — self-contained. No further questions generated.

### Q-unlock-confirm-ux
Exact question:
"Given Q1 landed on (b) soft unlock — cycle-level edit reopened, no bulk event cascade — what should the confirm step for unlock actually look like?"

Options were:
- (a) Plain confirm dialog, no typed input.
- (b) Typed confirmation (type cycle name).
- (c) Confirm dialog + optional reason note, stored alongside the action.

User answer:
"as recommended" (c)

Decision / takeaway:
- Unlock confirm = dialog with an optional free-text reason field. Reason (when provided) feeds the audit record decided in Q-unlock-audit below. New shared shape, not literally the same table as `AssignmentAuditRepository` (different domain — cycle/event actions, not assignment actions) but same field shape: actor, action, optional reason, timestamp.

Queue impact:
- None — self-contained.

### Q-unlock-notify
Exact question:
"Should leaders/sub-leaders be notified when a cycle they're staffing is unlocked, or when a specific event they've staffed gets reopened via the existing `reopenEvent`?"

Options were:
- (a) No notifications for MVP.
- (b) Notify only on actual event reopen, not on pure cycle-metadata edits.
- (c) Notify on both.

User answer:
"as recommended" (b)

Decision / takeaway:
- Cycle-level unlock (rename, date tweak, add one-off event) stays silent — no notification. A notification fires only when a specific event actually flips `scheduled -> draft` via `reopenEvent`, since that's the action that can unstaff/hide something a leader already worked on.

Queue impact:
- None — self-contained.

### Q-unlock-audit
Exact question:
"Should unlocking a cycle (and/or reopening an event under it) write an audit record — who, when, optional reason?"

Options were:
- (a) Yes, dedicated audit entries, following the existing `AssignmentAuditRepository` pattern.
- (b) No dedicated audit, rely on `updatedAt`.
- (c) Defer.

User answer:
"as recommended" (a)

Decision / takeaway:
- New audit trail for cycle-unlock and event-reopen actions, modeled on `assignment-audit.repository.ts`'s shape (actorId, action, reason, timestamp) but scoped to the planning-cycle domain — this is a new audit surface (e.g. a `PlanningCycleAudit`/`CycleAudit`-style entity+repository), not a literal reuse of the assignment-audit table, since the actions being audited (`unlock`, `reopen_event`) differ from assignment actions. Implementation detail to resolve during planning, not a further grilling question.

Queue impact:
- None — self-contained.

### Q-nav-url-granularity
Exact question:
"Given Q2 landed on (a) full nested-route split with the `/scheduling/planning-cycles` slug, should the step-sequence inside it (create -> template -> review, per the earlier BL-014 decision) and the selected cycle also be URL-addressable, or stay client-side state within one route?"

Options were:
- (a) Fully addressable: `/scheduling/planning-cycles/new`, `/scheduling/planning-cycles/:cycleId`.
- (b) Stay client-state.
- (c) Hybrid — `:cycleId` in URL, step stays client-state.

User answer:
"as recommended" (a)

Decision / takeaway:
- `/scheduling/planning-cycles/new` for the create step; `/scheduling/planning-cycles/:cycleId` for template+review of a selected cycle. Deep-linking and back/forward work at the cycle level.

Queue impact:
- None — self-contained. No further questions generated.

### Q-unlock-policy
Exact question:
"Should church admins be able to unlock a `locked` planning cycle, and if so, what happens to the events/staffing already generated under it?"

Options were:
- (a) Full unlock — bulk cascade `scheduled -> draft` on every event.
- (b) Soft unlock — cycle becomes editable again, but already-`scheduled` events untouched in bulk; per-event `reopenEvent` still used one at a time.
- (c) No cycle-level unlock at all — expand per-event tools only.

User answer:
"as recommended" (b)

Decision / takeaway:
- Unlock = cycle `locked -> draft`-equivalent editable state, scoped to cycle metadata + one-off events. No bulk event-status cascade. Existing per-event `reopenEvent` remains the only way to walk back an individual `scheduled` event, unchanged from today's behavior.

Queue impact:
- Unblocked 3 follow-on questions, now promoted into Current Question: Q-unlock-confirm-ux, Q-unlock-notify, Q-unlock-audit.

### Q-scheduling-nav-parent
Exact question:
"Promote `/scheduling` from a single route with client-side tabs into a real parent route with URL-addressable, role-gated nested children — `/scheduling/planning` (admin-only), `/scheduling/tailoring` and `/scheduling/builder-events` (leader/sub-leader) — replacing the current same-route tab+button mix?"

Options were:
- (a) Full nested-route split, breadcrumbs replace ambiguous buttons.
- (b) Partial split — only admin vs. leader, Tailoring+Builder-events stay tabs of each other.
- (c) Cosmetic-only fix, no route/role changes.

User answer:
"as recommended" (a), with one amendment: the admin planning slug should be `planning-cycles`, not `planning`, for specificity.

Decision / takeaway:
- Full nested-route split confirmed. Final route names: `/scheduling/planning-cycles` (admin-only), `/scheduling/tailoring`, `/scheduling/builder-events` (leader/sub-leader). Each route enforces its own role guard. Ambiguous "Back to cycles / Template library / Create cycle" button row is replaced by breadcrumb-style navigation distinct from in-page action buttons.

Queue impact:
- Unblocked 1 follow-on question, now promoted into Current Question: Q-nav-url-granularity (renamed from originally-queued Q-nav-breadcrumb-vs-tabs, updated to use the `planning-cycles` slug).

### Q-status-chip-dedup
Exact question:
"Split the header pill (`Julho 2026 [locked] 2026-07-01 → 2026-07-31`) into a name+status group and a separate period chip, and pick one canonical place for the 'locked' indicator instead of showing it in 3 places (header, `Selected cycle review` row, `Calendar review` corner)?"

Options were:
- (a) Header is sole source of truth; drop badge from both other spots.
- (b) Header split, keep badge on `Selected cycle review` too, drop only from `Calendar review`.
- (c) Header split only, leave redundancy as-is.

User answer:
"as recommended" (a)

Decision / takeaway:
- Header splits into two chips: `Julho 2026 [locked-badge]` and a separate `2026-07-01 → 2026-07-31` period chip. Header becomes the single source of truth for cycle status. Remove the status badge entirely from `Selected cycle review` and from `Calendar review` (the latter's ghost-button-styled "Locked" label is removed outright).

Queue impact:
- No further follow-on questions generated by this answer (self-contained UI change).

## Pruned Questions

_None yet._
