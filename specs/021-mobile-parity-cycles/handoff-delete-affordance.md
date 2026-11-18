# Handoff B: Delete Affordance (Session B)

**Run this in own session. Fully independent file set from Handoff A (`handoff-drawer-structure.md`) — safe to run in parallel, same time, different session.**

## First moves, next session

1. Turn on `/caveman full` first turn. Save token, keep tech substance.
2. Fresh session, run setup once: `node .claude/skills/impeccable/scripts/context.mjs --target apps/web`. PRODUCT.md + DESIGN.md already exist, no init needed.
3. If stuck (shadcn AlertDialog pattern, mutation-pending state pattern), use `find-skills` skill to hunt a helper skill (`frontend-specialist`, `react-architect`, `shadcn-specialist` already in repo) before improvising raw.
4. Route the actual fix through `/impeccable polish` against the two files below. A critique already exists, read it first, don't re-derive:
   `.impeccable/critique/2026-07-09T19-11-51Z__021-mobile-parity-cycles-handoff-mobile-polish-md.md`

## Own these files, nothing else

- `apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx`
- `apps/web/src/features/scheduling/components/planning-admin/calendar-row.tsx`

**Do NOT touch**: anything under `responsive-form-surface.tsx`, `ui/drawer.tsx`, `ui/button.tsx`, `ui/input.tsx`, `ui/alert-dialog.tsx`, or the 4 drawer consumers (`quick-create-event-modal.tsx`, `edit-event-dialog.tsx`, `edit-slot-dialog.tsx`, `create-slot-dialog.tsx`, `slot-form-fields.tsx`) — owned by sibling Handoff A, likely running same time in another session.

## Task 1 — P1: same destructive action, two visual treatments

Mobile day-delete (`planning-event-card.tsx` ~L111) is `variant="ghost"` + text label "Delete". Mobile slot-delete (same file, ~L206) and desktop delete (`calendar-row.tsx` ~L326, `ConfirmDeleteDialogContent`) are solid `variant="destructive"` icon buttons. Same danger level, different visual weight, few lines apart in the same component tree.

Fix: standardize day-level delete trigger to `variant="destructive"` to match its own slot-level sibling.

## Task 2 — P2: no visible feedback during delete

Confirm dialog closes synchronously in the same click handler that fires the delete mutation (both event-delete ~L136-139 and slot-delete ~L230-236 in `planning-event-card.tsx`), before `deleteEventPending`/`deleteSlotPending` ever gets a chance to render. Item sits untouched in the list with zero interim state until network round-trip resolves and a toast fires. Worst gap on the single highest-stakes action in this flow.

Fix: hold the dialog open with a spinner until mutation settles, OR apply an immediate optimistic dim/strike state to the card the instant delete is confirmed. Also swap delete button label to a progress verb ("Deleting…") matching how Save already swaps to "Saving…/Adding…" elsewhere in this feature — currently delete doesn't do this, small inconsistency worth closing at the same time.

## Explicitly decided, don't relitigate

Delete confirmation stays a **centered modal**, not a drawer — single yes/no decision, not a form; friction is a feature for a destructive action on an older/imprecise-motor audience. Don't move it to `ResponsiveFormSurface`.

## Verify before calling done

- Run/update component tests: `cycle-review-card.component.test.tsx`, `planning-event-card.component.test.tsx` (create if missing — this is exactly the kind of pending-state regression a test should pin down).
- Dev server CORS note from critique run: same as Handoff A — `localhost:4001` can't reach the API, fix allow-origin or browse from `192.168.0.200:4001` for real mobile-viewport verification (trigger delete, confirm spinner/dim state visible before the item disappears).
- Re-run `/impeccable critique` on `specs/021-mobile-parity-cycles/handoff-mobile-polish.md` after, confirm this P1 + P2 clear.
