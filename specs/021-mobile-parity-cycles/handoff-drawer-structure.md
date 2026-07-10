# Handoff A: Drawer Structure (Session A)

**Run this in own session. Don't run parallel w/ Handoff B's session on same files — no overlap here anyway, but keep separate for token isolation.**

## First moves, next session

1. Turn on `/caveman full` first turn. Save token, keep tech substance.
2. Skim `.claude/skills/impeccable/skill.md` context already loaded? No — fresh session, run setup: `node .claude/skills/impeccable/scripts/context.mjs --target apps/web`. Gets PRODUCT.md + DESIGN.md, already exist, no init needed.
3. If stuck on approach (shadcn primitive quirk, Tailwind sizing pattern, etc), use `find-skills` skill to hunt a helper skill (candidates already in repo: `tailwind-architect`, `shadcn-specialist`, `frontend-specialist`) before improvising raw.
4. Route the actual fix work through `/impeccable harden` (task 1, structural rule enforcement) then `/impeccable polish` (tasks 2-3). Don't hand-roll a critique — one already exists, read it first:
   `.impeccable/critique/2026-07-09T19-11-51Z__021-mobile-parity-cycles-handoff-mobile-polish-md.md`
   Skip re-deriving findings, go straight to fixing.

## Own these files, nothing else

- `apps/web/src/components/responsive-form-surface.tsx`
- `apps/web/src/components/ui/drawer.tsx`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/alert-dialog.tsx`
- `apps/web/src/features/scheduling/components/quick-create-event-modal.tsx`
- `apps/web/src/features/scheduling/components/planning-admin/edit-event-dialog.tsx`
- `apps/web/src/features/scheduling/components/planning-admin/edit-slot-dialog.tsx`
- `apps/web/src/features/scheduling/components/planning-admin/create-slot-dialog.tsx`
- `apps/web/src/features/scheduling/components/planning-admin/slot-form-fields.tsx`

**Do NOT touch**: `planning-event-card.tsx`, `calendar-row.tsx` — owned by sibling Handoff B (`handoff-delete-affordance.md`), maybe running in another session same time. Touching these = merge conflict risk, breaks the whole point of splitting.

## Task 1 — P0: mobile drawer controls still desktop-density

`DESIGN.md` rule: 44px+ touch targets on mobile/volunteer-facing controls, don't port 32px admin density into mobile flows w/o deliberate upsize. All 4 drawer consumers use default 32px `Input`/`Button` verbatim inside the `Drawer` mobile branch. `alert-dialog.tsx` confirm/cancel buttons same problem, 32px, no drawer at all involved (plain modal) but still mobile-reachable.

Fix at the structural level, not per-consumer: `ResponsiveFormSurface` (or a context it provides) should upsize its descendant `Input`/`Button` automatically when rendering the `Drawer` branch — don't make 4 files remember to opt in. Options: a size-context `Button`/`Input` read, or a wrapper className using Tailwind descendant/data-attribute selectors. Pick whichever fits existing primitive patterns (check `button.tsx`/`input.tsx` variant system first — `cva` based, likely easiest to extend with a context-driven size).

Also bump `alert-dialog.tsx`'s footer buttons off the 32px default.

## Task 2 — P1: drawer footer not sticky, pasted into scroll region

`responsive-form-surface.tsx` wraps children in `overflow-auto px-4 pb-4`. All 4 consumers render `DialogFooter` (not `DrawerFooter`, which pins via `mt-auto`) as the last child *inside* that scrollable div. Longer forms (edit-event's 4 fields, quick-create's two-date grid) can require scroll to reach Save — defeats the whole point of a bottom sheet (thumb-reach on primary action).

Fix: `ResponsiveFormSurface` should own footer placement. Give it a `footer: ReactNode` prop (buttons only), render via `DrawerFooter`/`DialogFooter` itself, outside the scroll wrapper on mobile. Update all 4 consumers to pass `footer` instead of rendering their own. `ui/drawer.tsx`'s `DrawerFooter` also needs `border-t` + extra bottom pad added — not inherited free from the primitive right now.

This closes the handoff-mobile-polish.md open question: single adaptive component beats render-prop, since render-prop just relocates the duplication into 4 conditional blocks instead of 1 owned spot.

## Task 3 — P2: silent-disable submit, no explanation

`create-slot-dialog.tsx` / `edit-slot-dialog.tsx` disable Save when start≥end, zero inline text saying why. First-timer gets dead button, no path to understanding. Add inline helper/error text near the time fields ("End must be after start").

## Verify before calling done

- Run component tests touching these files: `*.component.test.tsx` under the same dirs (`create-slot-dialog`, `edit-slot-dialog`, `edit-event-dialog`, `quick-create-event-modal` may not all have dedicated test files — check, add coverage for the footer prop swap if missing).
- Dev server CORS note from critique run: `localhost:4001` can't reach the API (`192.168.0.200:4000` CORS-locked to that exact origin). Either fix the dev CORS allow-origin, or serve/browse from `192.168.0.200:4001` directly, to get real mobile-viewport browser verification (screenshot the drawer open, form filled, footer visible without scroll).
- Re-run `/impeccable critique` on `specs/021-mobile-parity-cycles/handoff-mobile-polish.md` (or narrow to these files) after, confirm P0 + this P1 clear and score moves off 31/40.
