---
target: scheduling feature (planning -> tailoring -> builder, per 017-scheduling-reshape spec)
total_score: 16
p0_count: 2
p1_count: 2
timestamp: 2026-07-06T06-12-06Z
slug: web-src-routes-scheduling-src-features-scheduling
---
Method: dual-agent (A: design-review sub-agent · B: detector-scan sub-agent) + live browser verification pass (this session, Playwright MCP, post-install) — corrected to the real primary flow per user steer: Admin → /scheduling/planning (create cycle → build template → apply → lock) → /scheduling/tailoring (per-ministry slot inclusion/split/headcount) → /scheduling/events/:id/builder (assign/publish). The /scheduling index "New Event" modal is a secondary path (FR-009 dynamic/one-off events), not the primary flow, and is itself inconsistent with the primary flow's own event-creation form.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 0 | Builder header shows a green "Published" badge on every locked event regardless of actual state |
| 2 | Match System/Real World | 2 | Breadcrumb shows raw UUID; Calendar Review shows raw UTC Z timestamps |
| 3 | User Control & Freedom | 2 | No undo on delete/reassign |
| 4 | Consistency & Standards | 1 | Two different create-event UIs; native confirm/prompt vs Dialog; Published badge contradicts spec |
| 5 | Error Prevention | 2 | Confirm dialogs exist but unstyled |
| 6 | Recognition Rather Than Recall | 1 | "Local Leader"/"Local Sub Leader" both truncate to "Local L." |
| 7 | Flexibility & Efficiency | 1 | No bulk actions; redundant per-volunteer "Select slot" step |
| 8 | Aesthetic & Minimalist Design | 2 | Clean/restrained but nested-card density in slot-split UI |
| 9 | Error Recovery | 2 | Raw API error text in toasts |
| 10 | Help & Documentation | 2 | "How it works" copy genuinely useful |
| Total | | 16/40 | Poor |

## Anti-Patterns Verdict
No cross-register absolute bans present. Deterministic scan: zero findings (detect.mjs, exit 0). Real issues are semantic/logic bugs invisible to static pattern detection. No console errors across full live flow.

## Overall Impression
Visual design is fine. Core bug: builder header's "Published" badge uses pre-reshape logic (event.status === 'scheduled') which the 017 spec explicitly forbids (FR-026: Event MUST never be published). Since every reachable event is always 'scheduled', the badge is wrong 100% of the time and permanently disables the real Publish button (builder-header.tsx:126), blocking User Story 4 (roster publish) entirely.

## What's Working
1. requirement-cell.tsx accessible keyboard DnD path.
2. Template-to-cycle generation verified live and correct (5 Sundays generated correctly).
3. Tailoring page clean, monochrome, useful "How it works" copy.

## Priority Issues

[P0] Publish button permanently disabled for every event — isPublished derived from event.status==='scheduled' instead of MinistryParticipation.status==='published'. builder-header.tsx:63,126. Blocks US4 entirely, contradicts spec FR-026/decision #11. Fix: derive from participation status. /impeccable harden

[P0] Reassign dialog requires typing raw volunteer UUID. participationId.tsx:562-568. AssignmentPicker already solves this elsewhere. /impeccable harden

[P1] Two structurally different create-event UIs (index modal: separate date+hour+minute boxes; planning inline form: combined datetime-local). Confirmed live. /impeccable distill

[P1] Two different volunteers ("Local Leader", "Local Sub Leader") render as identical truncated "Local L." in builder volunteer list — confirmed live, real assignment-risk. /impeccable harden

[P2] Raw UTC "Z" timestamps in planning admin's Calendar Review panel, while rest of app renders local time correctly. Isolated component bug. /impeccable harden

[P2] Builder breadcrumb shows raw event UUID instead of event title. /impeccable clarify

## Persona Red Flags

Alex (power-user admin): would hit disabled Publish with no explanation; no bulk actions; redundant single-slot "Select slot" step.

Sam (accessibility-dependent): "Local L."/"Local L." collision is worse via screen reader — accessible name is just "Local L." for both.

Jordan (confused first-timer admin): would see "Published" on an untouched event and wrongly conclude the system already did their job.

## Minor Observations
- No console errors across the entire flow.
- "Select slot" redundant when an event has exactly one slot.
- "Viewing in Church Time" label on events list is a good trust signal, worth reusing in Calendar Review once its timezone bug is fixed.

## Questions to Consider
1. Was event.status ever meant to proxy "published," or is this leftover from the pre-reshape single-event-owner model?
2. Is rostering's reassign dialog simply never wired to the newer AssignmentPicker — what else in participationId.tsx is similarly half-migrated?
3. Is the index page's "New Event" modal an intentional secondary FR-009 affordance, or dead/stale code predating the planning-cycle flow?
