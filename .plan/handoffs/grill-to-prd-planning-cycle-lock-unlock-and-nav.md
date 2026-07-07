# Handoff: Grilling To PRD

Date: 2026-07-07
Source Session: .plan/grilling/2026-07-07-planning-cycle-lock-unlock-and-nav.md
Status: ready-for-prd
Scope: Planning-cycle screen fixes surfaced during manual testing — (1) day/event-level forced-override editing on locked cycles (replaces an earlier "unlock the whole cycle" idea, rejected mid-session for spec-conflict and scope reasons) with a leader-acknowledgment gate and shift-scoped volunteer notification; (2) restructuring `/scheduling` into a real parent route with role-gated nested children (`/scheduling/planning-cycles` admin-only, `/scheduling/tailoring` + `/scheduling/builder-events` leader/sub-leader); (3) deduplicating the "locked" status indicator to a single canonical spot and splitting the header pill into name+status vs. period chips.

## Stable Decisions

- **Day-edit scope**: admins may edit a locked/staffed event/day's time (start/end, shifts follow) or cancel it outright — no shift/headcount restructuring.
- **Mechanism**: `Event.status`'s existing state machine is untouched. A new lightweight acknowledgment record (eventId, changed-fields snapshot, leaderId, acknowledgedAt) gates the downstream volunteer notification — the edit itself applies immediately once the admin forces past the confirm dialog.
- **Friction**: a plain confirm dialog ("already staffed, editing will notify the leader for review before volunteers are told — continue?"), no typed confirmation.
- **Notification scope**: shift-level — only volunteers with an active assignment on the specific `Shift`(s) whose time changed, and only leaders of ministries participating in those shifts, are ever in scope (for the ack-ping and the eventual notification).
- **Leader-ack gate**: hard gate. The leader must explicitly acknowledge before the "notify affected volunteers" action becomes available. Acknowledge and notify are two distinct leader-side actions, not one combined button — the leader can acknowledge and then decide when (or whether) to actually notify.
- **Cancel uses the identical pipeline** as a time-edit (same confirm dialog, same leader-ack gate, same shift-scoped notify) — one mechanism for both, not a bespoke cancel-only path.
- **Nav restructure** *(corrected during `/speckit-plan`, see `specs/018-churchwide-ux-redesign/research.md` R6)*: `/scheduling/planning`, `/scheduling/tailoring`, and the bare `/scheduling` index already are 3 distinct file routes today, wired by `<Link>` — the URL already changes between them. `/scheduling/planning` is renamed `/scheduling/planning-cycles` (admin-only), `/scheduling/builder-events` gets its own path (replacing the misleadingly-named bare `/scheduling` index), and each gets a route-level role guard (today's gating is only reactive, via query 403s). The actual "URL never changes" gap lives inside `planning-cycles` itself: its "Back to cycles / Template library / Create cycle" row is `useState`-driven, not URL-driven — that state gets promoted to URL segments (`/scheduling/planning-cycles/new`, `/scheduling/planning-cycles/:cycleId`), and the button row becomes breadcrumb-style navigation, visually distinct from in-page action buttons.
- **URL granularity**: `/scheduling/planning-cycles/new` for the create step; `/scheduling/planning-cycles/:cycleId` for template+review of a selected cycle — deep-linking and back/forward work at the cycle level.
- **Status chip dedup**: header splits into a `<cycle name> [status badge]` chip and a separate `<start> → <end>` period chip. Header becomes the sole canonical location for cycle status; the redundant badges on `Selected cycle review` and `Calendar review` are removed outright.
- **Explicitly parked, not in scope**: a sub-leader-authored template (constrained by the admin's global/leader template) for shift counts — flagged by the user as a future idea, deliberately excluded from this MVP.

## Open Tensions

- The day-edit/ack/notify mechanism requires a new persisted entity (the acknowledgment record) and new server-side override paths in `updateEvent()`/`cancelEvent()` (`apps/server/src/application/db-planning-event-manager.ts`) — this contradicts `specs/018-churchwide-ux-redesign`'s explicit "no new domain entities / no schema changes" Constitution gate. **Resolved by scope split**: this feature becomes its own new spec (numbered after 018), not an amendment to 018. The nav-restructure and chip-dedup decisions are pure frontend/presentation and *do* fit inside 018's existing boundary — those become an 018 amendment instead.
- Whether `ChurchAdmin` should also be able to view `/scheduling/tailoring` / `/scheduling/builder-events` (for oversight), on top of Leader/Sub-leader, was never explicitly asked or answered in this session — worth a quick confirmation before the route guards are implemented, since it changes each route's allowed-roles list.
- No question in this session addressed what happens if a leader never acknowledges a forced edit (reminder cadence, escalation, or indefinite pending state) — left as an implementation default (e.g. the notify action simply stays unavailable indefinitely) unless the eventual PRD/spec wants to pin this down.

## PRD Expectations

- The day-edit/ack/notify feature's PRD/spec must NOT be folded into `specs/018-churchwide-ux-redesign` — it needs its own spec-kit spec (this repo's established convention per 018 itself: BL-014 grill → spec 018, hand-authored directly from the grilling session, no `.plan/prds` pipeline was used) and its own `manual-planning/0001-volunteer-scheduling/BACKLOG.md` entry, since it introduces a new domain entity and backend surface that 018 explicitly disclaims.
- The 018 amendment must stay scoped to nav-restructure + chip-dedup only — both fit its "frontend-only, no schema changes" Constitution gate as written; do not use this amendment as a vehicle to sneak in domain changes.
- Preserve the reasoning trail for the unlock → day-edit pivot (why cycle-level unlock was rejected: conflicts with 018's already-shipped `locked-review` read-only step-sequence state, `PlanningStep`/`usePlanningStep()`) so a future reader doesn't wonder why the simpler "just add an unlock button" design isn't what shipped.
- Preserve the shift-level notification scoping rationale explicitly (it was derived from the user's own worked example — 3 same-day services, only the last one's time changes — stated twice, unprompted) since it's easy to accidentally simplify to event-level scoping later and silently over-notify.

## Next Step

- This repo does not use the generic `luna-to-prd` → `.plan/prds/` pipeline (checked: no `.plan/prds/` directory exists, and `specs/018-churchwide-ux-redesign` itself went straight from its grilling session to a spec-kit spec). Following that same established precedent instead:
  1. Amend `specs/018-churchwide-ux-redesign/spec.md` + `tasks.md` with the nav-restructure and chip-dedup decisions (new FRs, new task phase).
  2. Add a new `manual-planning/0001-volunteer-scheduling/BACKLOG.md` entry for the day-edit/ack/notify feature (next id: BL-016), marked as already-grilled (pointing at this handoff + the source grilling session), not "needs a grilling session" like BL-014 originally was.
  3. Scaffold a new spec-kit spec (next available number after 018) for the day-edit/ack/notify feature via `/speckit-specify`, using this handoff and the source grilling session as its input.
