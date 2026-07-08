# Quickstart: Cycle Review Header Consolidation, Timezone Formatting & Draft Editing

Manual verification steps once implementation is complete. Run against the local dev stack (`bun run dev` or equivalent) with at least one draft cycle with 2+ day-events (one with multiple slots) and one locked cycle.

1. Open a selected draft cycle's review page. Confirm the header shows: name/status chip, date-window chip, an event-count chip, and a slot-count chip — and confirm the Calendar review card body no longer repeats any of that (US1).
2. Toggle church-time/local-time from the avatar menu. Confirm the header's window chip and every visible date/time in the Calendar review table changes to match, with no raw ISO or trailing "Z" anywhere (US2).
3. Confirm a collapsed day row shows only a date (no time, no window arrow). Expand it; confirm each slot row shows only a start–end time span, no date (US2).
4. On the draft cycle, delete one day's event. Confirm it disappears from the table and the header's event/slot counts drop accordingly (US3/FR-006).
5. Edit another day's event details; confirm the change is reflected in its row after saving (US3/FR-007). Then edit that same day's date specifically (on a day that has 2+ slots): expand it before and after the save, and confirm every slot's displayed time-span is identical to before the edit while the parent day row now shows the new date — i.e. the slots moved with the day, none were left behind on the old date (FR-007a).
6. Expand a day with 2+ slots; delete one slot. Confirm only that slot disappears, sibling slots remain, and the header's slot count drops by one (US3/FR-008).
7. Expand a day with exactly 1 slot. Confirm its delete control is disabled or hidden (FR-008's last-slot rule) — deleting that day's content requires the day-level delete from step 4 instead.
8. Edit a slot's start/end time; confirm the change is reflected after saving (US3/FR-009).
9. Open the locked cycle's review page. Confirm none of steps 4-8's delete/edit controls appear anywhere in the table (US3/FR-010).
10. On the draft cycle, confirm "Add manual event" appears in the same action row as "Apply template," styled as a peer action — and confirm the Calendar review card body no longer has a separate highlighted "manual exceptions" panel (US4).
11. Use "Add manual event" from its new location; confirm the existing quick-create flow still works end-to-end and the new event appears in the table (US4/FR-011-FR-012).
12. Attempt an edit/delete via the API directly (e.g. curl) against a cycle immediately after locking it mid-session; confirm the request fails with an error and no data changes (FR-013).
