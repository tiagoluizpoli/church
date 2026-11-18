# Handoff: Planning Page — Visual Regression + Information Architecture Rework

## Purpose

This session ran `/impeccable layout scheduling` then `/impeccable layout scheduling/planning`, restyling `participation-tailoring.tsx`, `template-manager-card.tsx`, and `template-block-row.tsx` (nested-card cleanup, workspace-page wrapper, checkbox/select tidy-up). Automated checks (biome, `tsc`, 82 unit tests, both relevant Playwright specs) all passed. The user then looked at the live `/scheduling/planning` page and flagged real problems automated checks can't catch (visual regression) plus a much bigger information-architecture complaint. Session ended here to hand off cleanly — no fix attempted on any of the items below yet.

## Current State

- Repo: `/home/tiago/01-dev-env/personal-repos/church/church`
- Branch: `018-churchwide-ux-redesign`
- Communication mode: `caveman`
- Dev servers were running at `http://localhost:4001` (web) and `http://localhost:4000` (server) during this session — check if still up before testing.
- Files touched this session (all committed-worthy, not yet committed — check `git status`):
  - `apps/web/src/features/scheduling/components/participation-tailoring.tsx`
  - `apps/web/src/features/scheduling/components/planning-admin/template-manager-card.tsx`
  - `apps/web/src/features/scheduling/components/planning-admin/template-block-row.tsx`
  - `apps/web/DESIGN.md` and `apps/web/.impeccable/design.json` (written earlier in session via `/impeccable document`)

## Bug 1 (likely a regression I introduced): Weekday `<select>` doesn't match `Input` sizing/alignment

Screenshot evidence: on `/scheduling/planning`, "Template name" (an `Input`) and "Weekday" (a raw `<select>`) sit stacked in the same card but visibly differ — the select is taller, and its native dropdown chevron sits flush against the box's right edge with no padding, while the label text has left padding. Looks lopsided/inconsistent next to the Input above it.

**Root cause (strong suspicion, not confirmed live):** In this session I simplified several raw `<select>` elements from an ad hoc classlist (`flex h-8 w-full border bg-background px-2.5 text-sm`) down to just `w-full text-sm`, intending to lean on the global base-layer reset in `apps/web/src/index.css` (`select:not([data-slot])` rule). That rule sets:

```css
min-height: 2.25rem;      /* 36px */
padding: 0.5rem 0.75rem;  /* 8px/12px */
```

But the shared `Input` component (`packages/ui/src/components/input.tsx`) is `h-8` (32px) with `px-2.5 py-1` and `text-xs`. So the two now have **different heights and different padding** sitting side by side — exactly the mismatch the user is seeing. Also: a native `<select>`'s dropdown arrow is browser-rendered and ignores `padding-right` on some engines/OSes, which is likely the "chevron way too far left / no matching padding" complaint — cosmetic asymmetry that CSS padding alone can't fix on a bare `<select>`.

**This same pattern was applied in 3 other places this session** — check all of them, not just the one in the screenshot:
- `apps/web/src/features/scheduling/components/planning-admin/template-manager-card.tsx` — `template-weekday-select`
- `apps/web/src/features/scheduling/components/participation-tailoring.tsx` — `tailoring-ministry-select` and `tailoring-cycle-select`

**Constraint for the fix:** these must stay real native `<select>` elements — `apps/web/tests/scheduling/us1-admin-plan.spec.ts` and `us2-leader-tailor.spec.ts`/`us4-roster-publish.spec.ts` drive them with Playwright's `.selectOption()`, which only works on native `<select>`, not the `@base-ui/react` `Select` primitive used elsewhere in `packages/ui`. Two real options:
1. Give the raw `<select>` explicit classes matching `Input` exactly (`h-8 radius-control border border-input px-2.5 text-xs ...`) instead of relying on the ambient global reset, plus `appearance-none` and a manually-positioned SVG chevron (background-image) with correct right padding — replicates `SelectTrigger`'s look on a real `<select>`.
2. Simpler: just copy `Input`'s exact class string onto the `<select>` (skip custom chevron), accept the native browser arrow sitting wherever the OS puts it — matches height/padding at least, may still have arrow-alignment oddity but much closer than now.
Recommend option 1 for real parity since this is a recurring pattern (4 selects) — worth a tiny shared class constant or a `NativeSelect` wrapper component (still rendering a bare `<select>`, just centralizing the class string) so the fix doesn't have to be repeated by hand a 5th time later.

## Bug 2 (unconfirmed, needs live repro): Stray small vertical scrollbar near top-right of viewport

Screenshot shows a short vertical scrollbar-with-arrows widget floating near the top-right of the content area (pointed at with a red arrow), not spanning the page height — looks like a nested scroll container overflowing by only a few pixels, not the main page scrollbar.

**Not confirmed to be caused by this session's edits** — I did not touch `app-shell.tsx` or layout-level containers this session. Two candidate culprits to check first, in order:
1. `apps/web/src/components/app-shell.tsx:293` — `<main className="flex-1 overflow-auto ...">`. If its flex-computed height is a fraction of a pixel taller than its content's available space (common with `min-h-screen` + `flex-col`/`flex-row` + padding-var combos), a real (non-overlay) scrollbar can appear on a near-zero overflow.
2. `apps/web/src/features/scheduling/components/scheduling-nav.tsx:47` — `overflow-x-auto` on the tab row. This is horizontal, so less likely to be the vertical scrollbar seen, but check it isn't somehow forcing a layout reflow that affects the parent's vertical overflow too.

**Next step:** reproduce live, open devtools, inspect which element actually has the scrollbar (Firefox devtools flags overflowing elements directly in the layout panel), don't guess further from the screenshot alone.

## Bug 3: Scheduling sub-nav tab order feels wrong

Current order in `apps/web/src/features/scheduling/components/scheduling-nav.tsx` (`NAV_ITEMS`, lines 11–30):

1. Builder events (`/scheduling`)
2. Tailoring (`/scheduling/tailoring`)
3. Planning (`/scheduling/planning`)

User's complaint: this doesn't match the actual workflow order. The natural lifecycle (confirmed by `CONTEXT.md` / the planning-admin step machine) is: **plan the cycle first → tailor ministry participation → build/staff the roster**. Suggested reorder: **Planning → Tailoring → Builder events**. This is a one-line array reorder in `NAV_ITEMS`, low risk — but confirm no test asserts tab order/position before changing (`grep -rn "Builder events\|SchedulingNav" apps/web/tests`).

## Bug 4 (large, IA-level): The Planning page shows everything at once instead of a guided flow

This is the big one — a genuine redesign, not a layout tweak. User's ask, paraphrased and organized:

**Problem statement:** `planning-admin.tsx` already has a step state machine (`usePlanningStep()` returning `'create-cycle' | 'template-and-review' | 'locked-review'`, see `planning-admin-context.tsx` and `STEP_LABELS` in `planning-admin.tsx`), but the UI doesn't act like a guided flow — it just swaps which cards render in a persistent 2-column grid on one page. Result: the "Event templates" card (`TemplateManagerCard`, a big always-visible form for building templates) and the cycle-creation form are both permanently on-screen, eating huge amounts of space for something used occasionally, not constantly.

**Requested restructure (user's words, organized):**
- **Templates should not be permanently visible.** Move template building either to its own sub-page (nested under Planning, not a new top-level sidebar item) or a modal/right-to-left slide-over panel. The template *list/CRUD* can live on its own page; the *apply* action should be a button on the selected cycle ("Apply a template") that opens a picker, applies, and closes — not a permanent half-page column.
- **Create Cycle should also be a modal/on-demand action**, not a permanently-visible form. Trigger it from a button (e.g. next to "Existing cycles").
- **Default visible content should just be the "Existing cycles" list.** Selecting a cycle from that list is what reveals the cycle review flow (the current `CycleReviewCard`) — as a nested step/page, not a second column that's always there.
- **The bottom "Cycle management stays nearby" card is redundant** — it currently re-renders `CreateCycleCard` + `CycleListCard` a second time on the page (see `planning-admin.tsx` lines ~143–155). Once create/list are properly modal/primary-view, this duplication should disappear entirely.
- Overall desired shape: a small set of **nested pages/steps within Planning** (not a new sidebar item) that flow start → middle → end, matching the step machine that already exists in code but isn't expressed in the UI/URL structure.

**Recommended approach for next session:** this needs `/impeccable shape scheduling/planning` (UX/IA planning before code) rather than jumping straight to `craft`/`layout` — it's a structural rework of routes/steps, not a spacing or component-styling fix. Worth deciding upfront: do the "nested pages" become real sub-routes (e.g. `/scheduling/planning/templates`, `/scheduling/planning/$cycleId`) or view-state within the existing single route? The existing `usePlanningStep`/`PlanningAdminProvider` context (in `planning-admin-context.tsx`) is probably the right seam to extend either way — read it fully before proposing a shape.

## Suggested Next Actions (in order)

1. Fix Bug 1 (select/Input mismatch) first — small, contained, affects 3 known locations, has a clear root cause.
2. Reproduce Bug 2 live in devtools before touching any CSS — don't guess.
3. Confirm no test depends on nav tab order, then reorder `NAV_ITEMS` for Bug 3.
4. Run `/impeccable shape scheduling/planning` for Bug 4 — read `planning-admin-context.tsx` (the step machine) and `planning-admin.tsx` fully first, then design the nested-page/modal restructure with the user before writing code.
5. Re-run `apps/web` unit tests + the `us1-admin-plan.spec.ts` / `us2-leader-tailor.spec.ts` e2e specs after each fix.

## Suggested skills

- `impeccable` (`shape` sub-command) for Bug 4 — this is exactly what `shape` is for: UX/IA planning before code.
- `impeccable` (`polish` or plain invocation) for Bugs 1–3 once reproduced.
- `diagnosing-bugs` if Bug 2's scrollbar turns out to need real investigation rather than an obvious one-line fix.

## Sensitive information

- None. No credentials, tokens, or real user data referenced in this doc.
