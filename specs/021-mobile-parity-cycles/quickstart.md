# Quickstart: Mobile Parity & Table Bulk-Expand for Cycles

Manual end-to-end verification against the local dev stack. Use browser devtools' mobile
emulation (or a real phone on the LAN) pinned to a viewport below the `md:` breakpoint for
steps 1-6; use a desktop-width viewport for steps 7-8.

1. Sign in as a ChurchAdmin on a mobile viewport (confirms the 401/cookie fix — login persists
   across a page reload and an authenticated call like the notifications endpoint succeeds).
2. Open a draft cycle's Calendar review. Confirm the mobile card list (`PlanningEventCard`)
   shows each day's date and each slot's time formatted (no raw ISO/"Z"), matching what the
   desktop table shows for the same cycle.
3. Toggle church-time/local-time. Confirm every visible date/time on the mobile card list
   updates immediately.
4. Add a new day-event via the mobile surface; confirm it opens as a bottom drawer (not a
   centered dialog) and the new event appears in the list on save.
5. Edit and then delete that day-event from mobile; confirm both round-trip correctly.
6. Expand a day, add a slot, edit it, then confirm its delete control is disabled once it's the
   last remaining slot; delete a non-last slot and confirm siblings are unaffected.
7. Open a locked cycle on mobile; confirm none of steps 4-6's controls render.
8. Switch to desktop viewport. On the Calendar review table, use "Expand all" — confirm every
   day row's slots show; use "Collapse all" — confirm every day row collapses. Manually
   re-expand one row, then confirm "Collapse all" still collapses it (one-shot, not a synced
   toggle).
9. On mobile, open the nav drawer. Confirm child items under "Scheduling" visually read as
   children (connector/indent treatment) without changing which items exist or where they
   navigate; tap "Cycles", confirm it navigates and highlights the same as before this change.
10. On mobile, open the nav drawer, open the theme control, select "dark" — confirm the app
    switches to dark mode immediately (not just on desktop). Repeat for "light" and "system".
