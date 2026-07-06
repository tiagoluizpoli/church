# Grilling Session: BL-014 Church-wide UX/IA Redesign

Date: 2026-07-06
Status: in-progress
Source Skill: grill-with-docs
Scope: BL-014 only (manual-planning/0001-volunteer-scheduling/BACKLOG.md) — church-wide navigation, dashboard, notifications, scheduling flow, visual theme. Not a checklist of independent fixes; goal is a single coherent IA before any implementation.

## Starting Context

- User prompt: Grill only BL-014 (church-wide UX/IA redesign) from the backlog. User's framing: the frontend UX is currently bad ("horrible"), and getting the screen/workflow design right up front should produce better downstream work. Explicitly wants focus narrowed to this one item so effort concentrates on what matters.
- Initial reasoning:
  - BL-014 itself says: "do not start implementation from this entry alone... needs a dedicated grilling/design session first." This session is that session.
  - Backlog names 6 concrete symptoms: (1) leftover template scaffolding (`/` ASCII banner, `/todos` stub), (2) dead sidebar links (`/shifts`, `/alerts`, `/profile` don't exist), (3) notifications duplicated (sidebar nav slot exists but no route; real inbox is bolted into the dashboard), (4) volunteer dashboard is an undifferentiated vertical stack of 4 sections, (5) scheduling/planning flow doesn't narrate the cycle → template → event → participation model, (6) visual theme is untouched shadcn default (4px radius).
  - Codebase verification done directly (not delegated):
    - `apps/web/src/routes/index.tsx` confirmed: literal ASCII banner + bare `<EventList />`.
    - `apps/web/src/components/app-shell.tsx` confirmed: `desktopNavItems` includes `Home, Dashboard, Shifts, Scheduling, Alerts, Availability, Todos`; only `dashboard.tsx`, `scheduling.tsx`, `availability.tsx`, `todos.tsx` (stub), `index.tsx` exist as routes — `shifts.tsx`, `alerts.tsx`, `profile.tsx` do not exist anywhere under `apps/web/src/routes/`. Topbar has Search/Timezone/ModeToggle/UserMenu — no bell icon anywhere today.
    - `volunteer-dashboard.tsx` confirmed: single `<div className="space-y-4">` stacking Availability-needed, Upcoming-assignments, Notifications-inbox, Ministry-schedule sections plus two dialogs — matches the "undifferentiated stack" complaint exactly.
    - `CONTEXT.md` confirms canonical roles/entities to design nav and IA around: `Volunteer`, `Ministry` (`leader`/`sub_leader` roles scoped to a Ministry), `ChurchAdmin` (church-level, above ministries). Server-side `systemRole` union is `'leader' | 'sub_leader' | 'volunteer' | 'admin'` (confirmed in `apps/server/src/domain/conflict/types.ts` and `ministry-volunteer.ts`) — so "sub-leader" mentioned in the backlog is a real, already-implemented role, not a hypothetical.
  - Important tension already visible: several backlog symptoms (dead nav links) point at pages that were never built at all — so the redesign isn't purely "reorganize existing built screens," it may also need to decide the fate of features that were only ever stubbed as nav intent (Shifts, Alerts/Notifications-as-a-page, Profile).

## Current Question

_None currently queued. All questions from this session are answered — see below. Awaiting explicit user confirmation that the session is finished and stable enough for PRD handoff (per `luna-grill-with-docs` rule: do not write the grill-to-PRD handoff until the user explicitly says the session is done)._

## Future Questions

_None._
2. Q-scope-check
   Exact question: "Should this redesign be checked against `specs/017-scheduling-reshape/spec.md` / `test-plan.md` DL2/DL3/DL4 scenarios before finalizing the sitemap, to make sure no existing covered flow gets silently dropped?"
   Why it is queued: Backlog explicitly asks for this; best done once a candidate sitemap exists to check against, so it's late in the queue.

## Answered Questions

### Q-tool-timing
Exact question:
"Visual tool is now decided: Impeccable (impeccable.style), already installed in this repo as a skill (`.claude/skills/impeccable/`) and already producing output (`.impeccable/critique/...`), explicitly built to layer on top of shadcn (which this repo already uses). You said 'let's start that first.' Does that mean: (a) kick off the Impeccable visual pass now, in parallel with / ahead of finishing this grilling session's remaining synthesis, or (b) Impeccable is simply the now-settled answer to 'which tool,' and the actual visual pass still waits until the IA/sitemap decisions from this session are written up (handoff → PRD) so Impeccable has a stable target to work against?"

User answer:
"b"

Decision / takeaway:
- Impeccable is the settled visual-design tool for BL-014's visual pass, but the actual Impeccable-driven audit/redesign work starts only after this session's IA decisions (dashboard tabs, role-split nav, scheduling step-sequence, `EventList`/create-event consolidation) are written up and implemented — not before, and not in parallel. Sequencing: finish grilling synthesis → handoff → implement IA → run Impeccable on the settled screens.

Queue impact:
- Closes the last open question. No further questions currently queued.

### Q-narrative-shape
Exact question:
"`PlanningAdmin` renders 4 cards unconditionally in a 2×2 grid — `CreateCycleCard`, `CycleListCard`, `TemplateManagerCard`, `CycleReviewCard` — all visible regardless of whether a cycle exists yet or is locked. Should this become a guided step sequence (showing only the relevant step for the cycle's current state), or stay a grid with better labeling?"

User answer:
"as recommended" (step sequence)

Decision / takeaway:
- `CreateCycleCard` = step 1 (shown when no active draft cycle). `TemplateManagerCard` + `CycleReviewCard` = steps 2-3, shown once a cycle is selected. `CycleListCard` becomes a secondary sidebar/history rather than a co-equal grid card.

Queue impact:
- Closes symptom 5's "cards crammed on one page" complaint for the planning-cycle screen specifically.

### Q-eventlist-duplicate
Exact question:
"`EventList` (with its own `QuickCreateEventModal`) renders on *both* `/` (homepage) and `/scheduling/` (index) — a real duplicate surface, not just a duplicate creation form. Should `EventList` be removed from `/` entirely, with `QuickCreateEventModal` becoming the one canonical create-event UI under `/scheduling/` only?"

User answer:
"as recommended" (remove from `/`)

Decision / takeaway:
- `EventList` and its "New Event" modal live only under `/scheduling/`. `/` is freed up to become a real landing page once symptom 1's ASCII banner/ todo-stub cleanup happens. Planning flow's separate inline create-form gets unified with (or removed in favor of) `QuickCreateEventModal`.

Queue impact:
- Directly informs the eventual `/` redesign (symptom 1) and the single-create-event-UI decision (P1 from Q2).

### Q-identity-badge
Exact question:
"In the builder's volunteer list, 'Local Leader' and 'Local Sub Leader' both truncate to identical 'Local L.' — a real assignment-risk bug (P1, confirmed live) and an accessibility problem (same screen-reader name for both). How should identity be disambiguated?"

User answer:
"both" — role badge/chip shown by default AND full role label available on hover/expand

Decision / takeaway:
- Builder volunteer list gets a role badge/chip next to the (possibly still-truncated) name, visible by default and screen-reader-distinct without interaction — plus a hover/expand affordance surfacing the full role label for extra clarity. Belt-and-suspenders, not either/or.

Queue impact:
- Closes the P1 name-collision finding from Q2.

### Q-visual-tool
Exact question:
"For the visual design pass (radius, color, spacing, typography), do you want to pick an AI UI tool now (Stitch/Replit/etc. — backlog says none chosen), or should this grilling session lock the IA/sitemap only, leaving visual-tool selection as a separate follow-up?"

User answer:
"I actually found something... it's called Impeccable... I just installed it... let's start that first." (impeccable.style)

Decision / takeaway:
- Tool is decided, not deferred, and it isn't Stitch/Replit as the backlog originally floated: **Impeccable** (impeccable.style), explicitly designed to layer on top of shadcn (which this repo already uses). Already installed in-repo: `.claude/skills/impeccable/` skill exists, and `.impeccable/critique/` already has output (the same critique file that shaped Q2). This supersedes the backlog's "no tool chosen yet" framing entirely.

Queue impact:
- Opened a new, narrower question (Q-tool-timing, now current): the tool choice is settled, but *when* to actually run the Impeccable pass (now vs. after this session's IA decisions are implemented) still needs the user's call.

### Q-scope-check
Exact question:
"Should this redesign be checked against `specs/017-scheduling-reshape/spec.md` / `test-plan.md` DL2/DL3/DL4 scenarios before finalizing the sitemap, to make sure no existing covered flow gets silently dropped?"

User answer:
"as recommended" (check, as a post-draft verification step, not a blocker now)

Decision / takeaway:
- Once the sitemap/IA from this session is written up, cross-check it against `specs/017-scheduling-reshape/spec.md` and `test-plan.md` DL2/DL3/DL4 before treating it as final — a verification step in the handoff, not an open design question.

Queue impact:
- Becomes a checklist item for the grill-to-PRD handoff rather than a standalone question.

### Q-notification-bell
Exact question:
"Confirm the bell-icon notification center: lives in the topbar (desktop) — where on mobile, since the mobile top header today only has Search + Menu? Dropdown shows N most recent, 'View all' deep-links to a full `/notifications` route?"

User answer:
"yes" (agreed with the recommended placement/behavior)

Decision / takeaway:
- Bell: desktop topbar (next to Timezone/Mode/UserMenu), mobile top header (third icon next to Search+Menu — not the bottom nav, since it's global state not a nav destination). Dropdown shows unread-first recent notifications, reuses existing `NotificationDetailSheet` deep-link resolution. "View all" opens a new `/notifications` route (doesn't exist yet) for full history/pagination.

Queue impact:
- None directly — this closes symptom 3 fully. Confirms notifications have exactly one home (the bell) system-wide.

### Q-dashboard-split
Exact question:
"Should the volunteer dashboard's 4 stacked sections (Availability-needed, Upcoming-assignments, Notifications, Ministry-schedule) become separate routed pages under a `Dashboard` nav grouping, or stay on one page redesigned with real visual hierarchy (tabs/cards) instead of a flat stack?"

User answer:
"yes" (agreed with the recommended tabbed single-page approach)

Decision / takeaway:
- `/dashboard` stays a single route. The flat stack is replaced with tabs: `Upcoming-assignments` (default), `Availability-needed` (badge/count on its tab), `Ministry-schedule` (its own tab). Notifications is confirmed out of this page entirely (moved to the bell).

Queue impact:
- Q-notification-bell can now assume Notifications has no remaining presence on the dashboard — the bell is the sole notification surface, not a duplicate.

### Q-nav-scope
Exact question:
"Should the primary nav (desktop sidebar + mobile bottom bar) differ by role — i.e. does a plain Volunteer see a different nav set than a Leader/Sub-leader (who also manages a Ministry's rostering) or a ChurchAdmin (who manages PlanningCycles/Templates church-wide)?"

User answer:
"yes" (agreed with the recommended two-nav-set split)

Decision / takeaway:
- Nav branches by role: Volunteer gets `Dashboard`, `Availability`. Leader/Sub-leader/ChurchAdmin get `Dashboard`, `Scheduling`, `Availability`. Notification bell is universal top-bar chrome, not a per-role nav item.

Queue impact:
- Q-dashboard-split now knows Volunteer nav has exactly one top-level slot (`Dashboard`) for all volunteer-facing content — informs whether sub-sections become separate routes or stay on one page.

### Q2
Exact question:
"An `/impeccable` critique of the scheduling feature (`.impeccable/critique/2026-07-06T06-12-06Z__web-src-routes-scheduling-src-features-scheduling.md`) surfaced real correctness/consistency bugs sitting in exactly the flow BL-014 symptom 5 complains about (planning → tailoring → builder): two P0s — the builder's 'Published' badge is derived from `event.status === 'scheduled'` instead of `MinistryParticipation.status === 'published'`, so it's wrong 100% of the time and permanently disables the real Publish button (`builder-header.tsx:63,126`), blocking User Story 4 entirely; and the reassign dialog makes leaders type a raw volunteer UUID (`participationId.tsx:562-568`) despite `AssignmentPicker` already solving that elsewhere. Plus P1s: two structurally different create-event UIs (index-page modal vs. planning inline form), and two distinct volunteers ('Local Leader'/'Local Sub Leader') both truncating to identical 'Local L.' in the builder's volunteer list. Should BL-014's scope include fixing these, or should they stay a separate, independent bug-fix track?"

User answer:
"yes" (agreed with the recommended split)

Decision / takeaway:
- The two P0s (Publish-button logic bug, raw-UUID reassign dialog) are spun out as independent fast-follow bug fixes, not gated on this grilling session or BL-014's IA decisions.
- The two P1s (duplicate create-event UI, "Local L." name collision) stay folded into BL-014, specifically into the scheduling-narrative question, since they're consistency/IA calls this redesign should make once.

Queue impact:
- Q-scheduling-narrative's scope confirmed to include: unifying the two create-event UIs and fixing identity rendering in dense lists, in addition to the original step-sequence-vs-cards framing.

### Q1
Exact question:
"The sidebar today has nav entries for `/shifts` and `/profile` that point at routes which were never built (no `shifts.tsx`, no `profile.tsx` exist) — these look like leftover intent from early planning, not features anyone decided to cut. For this redesign: should the new IA (a) design real destinations for `Shifts` and `Profile` as part of this redesign's scope, or (b) treat them as scaffolding to delete now, with `Shifts`/`Profile` as a *separate*, later backlog item once there's an actual product decision to build them?"

User answer:
"(b)"

Decision / takeaway:
- `Shifts` and `Profile` nav entries are cut from IA scope entirely. They will be deleted as leftover scaffolding, not redesigned. Any future need for a real Shifts or Profile page is a separate, later backlog item requiring its own product decision first.

Queue impact:
- Frees the mobile bottom-nav's 4-slot budget (currently `Dashboard, Shifts, Alerts, Profile`) by at least 2 slots — directly informs Q-nav-scope and Q-notification-bell (where the bell physically goes on mobile, since a slot is now free).

## Pruned Questions

_None yet._
