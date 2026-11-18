# Quickstart: Planning Cycles Table View

Manual end-to-end sanity check once implementation lands. Run against a desktop-width browser window (≥768px, this repo's `md:` breakpoint — `research.md` R4) and, separately, a narrower one.

1. **Desktop — Planning cycles index**: Sign in as ChurchAdmin, visit `/scheduling/planning-cycles`. Confirm existing cycles render as table rows (name / window / status columns), not stacked cards. Confirm clicking a row still selects that cycle (same behavior as today's card click).
2. **Desktop — Template library**: From the cycles index, open "Template library". Confirm saved templates render as table rows (name / weekday / block count), with Edit/Delete still reachable per row.
3. **Desktop — Selected cycle review, flat rows collapsed**: Select a cycle with events. Confirm the Calendar review section renders one collapsed table row per weekday/date entry, each showing its window and slot count, with no slot detail visible yet.
4. **Desktop — expand a row**: Expand one weekday row. Confirm its individual time-slot rows appear nested beneath it. Expand a second row and confirm the first row's expanded state is unaffected. Collapse the first row and confirm only it collapses.
5. **Desktop — locked cycle**: Select a locked cycle. Confirm the Calendar review table still renders (read-only, no new editing affordance introduced by the table).
6. **Desktop — empty states**: With no cycles/templates/events, confirm each screen shows its existing empty-state message rather than an empty table shell.
7. **Narrow viewport — no regression**: Resize below 768px (or use a mobile device emulation). Revisit all three screens and confirm each renders its original card/list layout, unchanged from before this feature.
8. **Breakpoint crossing**: While on the Planning cycles index with a cycle selected, resize the window across the 768px boundary. Confirm the layout switches between table and card without losing the selected cycle.
9. **Scope check**: Visit Availability, Tailoring, Builder events, and the volunteer Dashboard. Confirm none of these screens' list presentations changed.
