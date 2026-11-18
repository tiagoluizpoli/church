# Quickstart: Verifying the Church-wide UX/IA Redesign

Manual walkthrough matching `spec.md`'s acceptance scenarios. Run against a local dev environment with at least one Volunteer-only user and one Leader/Sub-leader/Admin user (see existing `VOLUNTEER_STORAGE_STATE` Playwright fixtures for ready-made accounts).

## 1. Role-appropriate navigation (User Story 1)

1. Sign in as a Volunteer-only user. Confirm the nav shows exactly `Dashboard` and `Availability` — no `Scheduling`, no `Shifts`/`Alerts`/`Profile`/`Todos`.
2. Sign in as a Leader/Sub-leader/Admin user. Confirm `Scheduling` additionally appears.
3. Visit `/`. Confirm no ASCII banner, no duplicate builder-events list — a real landing surface instead.

## 2. Single notification center (User Story 2)

1. Trigger a notification (e.g., fire an availability reminder for a test volunteer).
2. Confirm the top-bar bell shows an unread count, on both desktop and mobile viewport widths.
3. Open the dropdown; confirm unread-first ordering and that clicking an item deep-links to the correct context (availability / assignment / ministry schedule).
4. Click "View all"; confirm the full `/notifications` route opens and can page through history.
5. Open the volunteer dashboard; confirm no notifications section is present there.

## 3. Organized volunteer dashboard (User Story 3)

1. Open `/dashboard` as a Volunteer with at least one outstanding availability item and one upcoming assignment.
2. Confirm `Upcoming Assignments` is shown by default.
3. Confirm the `Availability Needed` tab shows a visible count without switching into it.
4. Switch to `Ministry Schedule`; confirm it no longer shares vertical space with the other two sections.

## 4. Guided scheduling/planning flow (User Story 4)

1. As an Admin with no existing planning cycle, visit `/scheduling/planning-cycles` (renamed from `/scheduling/planning` in the 2026-07-07 amendment, section 6 below). Confirm only cycle creation is presented.
2. Create a cycle. Confirm the view now shows template application + event review as the active steps, with the cycle list demoted to a secondary panel.
3. Lock the cycle. Confirm the view becomes a read-only review, not an editable step.
4. From any entry point that can create an event (`/scheduling/` and anywhere else previously reachable), confirm exactly one create-event interface is used.
5. In the schedule builder, locate two volunteers whose names would otherwise truncate identically; confirm a role badge disambiguates a Leader from a Sub-leader.

## 5. Regression check (FR-014 / SC-006)

Run the existing Playwright suite covering `specs/017-scheduling-reshape/test-plan.md`'s DL2/DL3/DL4 scenarios against the redesigned screens; all must still pass unmodified in intent (selectors/paths may need updates for the new IA, but no scenario's coverage may be dropped).

## 6. Nav restructure & chip dedup (Phase 8, 2026-07-07 amendment)

1. As a ChurchAdmin, visit `/scheduling/planning-cycles`. Create a cycle; confirm the URL updates to `/scheduling/planning-cycles/:cycleId`. Open the template library from that cycle; confirm the URL reflects it too (not just `activeView` component state as before). Use browser back/forward; confirm both retrace correctly.
2. As a Leader/Sub-leader, visit `/scheduling/tailoring` and `/scheduling/builder-events` directly by URL; confirm both load. As a non-ChurchAdmin, attempt `/scheduling/planning-cycles` by URL directly; confirm you're redirected/denied before the page renders (not after a delayed query-driven access-denied flash).
3. As a ChurchAdmin, lock a cycle. Confirm the header shows the cycle name with its status badge as one chip, and the date range as a separate chip. Confirm `Selected cycle review` and `Calendar review` no longer show their own "locked" badge — the header is the only place status appears.
4. Confirm the "Back to cycles / Template library / Create cycle" row now reads as breadcrumb-style navigation (distinct from "Create cycle," which remains an obvious primary action button).
