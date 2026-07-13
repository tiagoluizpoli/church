# Iteration 2: Horizontal Day-Strip Filters & Row-Level Save Model

**Feature Branch**: `022-tailoring-workspace` (amendment)

**Created**: 2026-07-12

**Status**: Draft, partially superseded — this file has been run through `speckit-clarify` (2026-07-12). **`spec.md` is now authoritative**, not this file. See the correction banner below before reading Part C.

**Supersedes**: The date-filter and slot-row-save portions of `spec.md` / `plan.md` as originally shipped (R2, R3 in `plan.md`). Everything else in the original spec (ministry list → cycle list → workspace routing, empty/error/forbidden states, the three-layer calendar signifier system's *meaning*, mobile touch-target promotion via `FormControlSizeProvider`) is unchanged and still authoritative.

**Origin**: User-supplied voice-transcribed redesign request (2026-07-12), processed through the `prompt-optimizer` skill, then refined against 3 follow-up clarifying answers. This file is that optimized prompt, filed here per user request so the decisions aren't lost before implementation.

> **⚠️ Correction (2026-07-12, during `/speckit-clarify`)**: Part C below describes a single combined row-level save (split + headcount together). That was a misreading of the original request, caught and corrected during clarification. The corrected model — Serving autosaves, split saves independently via its own dirty-gated button, headcounts save once per slot across all shifts via a separate button — is recorded in `spec.md`'s `## Clarifications` section and `research.md` R12/R14 (which also adds keyboard navigation, per-call partial-failure handling, and `@tanstack/react-form` adoption). Part C is left below **unedited, struck through in spirit but not in text**, for the historical record of what was originally decided and why the correction was needed — read `research.md` R12 for the actual authoritative decision, not this section.

---

## Why this file exists instead of editing `spec.md` directly

`spec.md` documents what was actually built and critiqued (score 19/40 pre-fixes → resolved, per `plan.md`'s design-critique note). This iteration changes real acceptance criteria for two of its already-shipped pieces. Rather than silently rewriting shipped history, this is filed as a dated amendment. Before implementation starts, run this through `speckit-clarify` (or fold it into `spec.md` directly) so `spec.md`/`plan.md`/`tasks.md` stay the single source of truth — see Workflow below.

## Decisions (resolved — do not re-ask)

These were open questions in the first draft of this iteration; the user has decided all three:

1. **Leave-confirmation guard extends to row-level unsaved edits.** The existing `AlertDialog` in `$cycleId.tsx` (currently keyed off `touchedParticipationIds`, which only fills on mutation *success*) must also catch a leader trying to leave the **page** while any row has uncommitted local split/headcount edits. This is a correctness requirement, not a nice-to-have — it's the direct mechanism for the "don't want him to lose state" goal this whole iteration is motivated by.
2. **Flipping Serving Yes→No keeps local edits in memory, session-only.** If a leader has configured shifts/headcounts on a row, then flips Serving off, do not discard that local state — keep it in component state in case they flip back to Yes. It is only actually lost if the leader navigates away / refreshes / does something that unmounts the workspace — that's expected and fine, no special persistence needed beyond the session.
3. **"Other filters" (name search, time-of-day window) also go horizontal, in this same pass, not deferred.** The earlier draft scoped this out due to a self-contradiction in the source transcript; the user has confirmed it's in scope now. Layout: the new horizontal day-strip stays on top (where the calendar is today), and the name/time-of-day filters move to a horizontal row immediately below it — both replacing the current vertical sidebar-stacked filter column entirely, matching the wireframe's top-to-bottom "Date filter" → "Other filters" horizontal-bar arrangement.

## Part A — Date filter: calendar grid → horizontal day strip

Replace the current `TailoringCalendar` (`apps/web/src/features/scheduling/components/tailoring/tailoring-calendar.tsx`, a month-grid `react-day-picker` instance) with a horizontally-scrolling strip of day cells, one column per day in the cycle:

- Each cell: day-of-week abbreviation (Sun/Mon/Tue/Wed/Thu/Fri/Sat) stacked above the day number.
- Same selection semantics as today: click a day to filter the slot list to that day; keep the existing three-layer signifier system (fixed non-interactive cycle-bounds band, event-day dot markers, ring-outline selected-day state) — only the container/layout changes from grid to strip, not the meaning of any signifier.
- Horizontally scrollable via: mouse click-and-drag, touch swipe, keyboard arrow keys (roving focus, added during `/speckit-clarify`), and a chevron button fixed at each end for discrete step-scrolling. **Resolved via `/impeccable shape` (2026-07-12)**: hand-rolled pointer events, free momentum scroll (no snap-to-day) — see research.md R11 for the full decision and rationale, not a deliberate library choice as originally left open here.
- Must not degrade for long cycles (a 3-month cycle ≈ 90 day cells is the stated worst case) — this is specifically why the fixed month-grid is being replaced.

## Part B — Other filters move below the day strip, horizontally

Move `TailoringFilters` (name search input, time-of-day window select) out of the current vertical sidebar column and into a horizontal row directly beneath the new day strip. This replaces today's `lg:grid-cols-[minmax(320px,0.6fr)_minmax(0,1.4fr)]` sidebar+content split in `$cycleId.tsx` with a single-column, top-to-bottom stack: day strip → filter row → slot list. **Resolved via `/impeccable shape` (2026-07-12)**: yes, the day strip + filter row stay sticky as one unit at the workspace top (replacing the calendar's current `lg:sticky lg:top-4`), so day-filtering stays reachable while scrolling a long slot list — see research.md R11.

## Part C — Superseded, see research.md R12

> This section is preserved as-originally-written for the historical record. It is **not** the authoritative decision — read `research.md` R12 instead. The one-line difference: it is not "three saves → one row-level save"; it is "three saves → three tiers that stay independent (instant Serving, dirty-gated split, and one combined-across-shifts headcount save)."

Current behavior (`tailoring-slot-list.tsx` + the three mutations in `$cycleId.tsx` — `saveInclusions`, `splitShifts`, `saveHeadcounts`): inclusion checkbox autosaves instantly; shift-split has its own explicit save button; each shift's headcount has its own explicit save button. Replace with:

1. Replace the raw checkbox (`<input type="checkbox">`, already flagged as an accessibility gap since it skips the shadcn `Checkbox` component used everywhere else in this app) with an explicit **Serving / Not serving** two-state control per row. This toggle autosaves immediately on click — same as today's checkbox. This is the only action in the row that stays instant.
2. The moment a row flips to Serving, default it to 1 shift automatically, reusing the existing FR-013 default-single-shift logic already in `participation-tailoring.utils.ts` — do not reimplement it. Displayed shift count is 0 while not-serving, 1+ once serving (leader-adjustable).
3. Split-mode changes and all shifts' headcount inputs within that row become **local, uncommitted edits** — no autosave, no per-field save button. They accumulate in-row, including across a Serving Yes→No→Yes cycle within the same session (Decision 2 above).
4. **One Save button per row** (not per shift, not a page-level global save) commits everything changed in that row — split + all headcounts — together. Row-level blast radius is deliberate: a page-level global save risks losing everything on a connectivity failure; a row-level save risks losing at most one row's edits.
5. While a row has uncommitted local edits, visibly flag it (a badge/indicator, consistent with the existing page-level "Touched" chip in the intro panel). The leader can navigate away from / collapse that row without being blocked — the flag persists so they can find it again. Leaving the **whole page** with any row in this state is a different case — see Decision 1.
6. **Validation**: Serving=Yes with headcount still at its zero/blank default is an invalid, unsavable state. The row-level Save button must be disabled AND the row must clearly communicate what's wrong and what's needed to become savable — not a silently-disabled button with no explanation.
7. On successful row save, this must still feed the existing page-level `touchedParticipationIds` / `isDirty` tracking so the top "Request availability" action still knows this row changed. Do not let this regress silently.

No backend/schema changes are implied by Part C — the same three mutation shapes (`setParticipationInclusions`, `splitParticipationShifts`, headcount upsert) are reused, only their client-side orchestration changes (one combined trigger instead of three independent ones). This preserves the original `plan.md`'s "no backend changes" constraint.

## Workflow

1. ~~Reconcile this file's acceptance criteria into `spec.md` via `speckit-clarify`~~ — **done** (2026-07-12). `spec.md`, `research.md` (R11–R14), `data-model.md`, `plan.md`, and `tasks.md` Phase 8 are now the reconciled, authoritative set. Read `spec.md` and `research.md` R11–R14 in full before touching code, not this file's Part C.
2. ~~Use the `impeccable` skill's `shape` command to resolve the two genuinely open interaction questions~~ — **done** (2026-07-12): hand-rolled pointer events, free momentum scroll, sticky day strip + filter row. See research.md R11.
3. Use the `impeccable` skill's `craft` command (or direct TDD implementation) to build it, matching `DESIGN.md`'s existing tokens and this codebase's already-established patterns from the most recent session: `Collapsible`-based row expand/collapse, per-row pending-state scoping via `mutation.variables` (not a shared boolean), outline-variant secondary buttons vs. a single page-level primary CTA, shadcn `Checkbox` (not a raw `<input>`) for binary toggles, and (new, per research.md R14) `@tanstack/react-form` + `zod` for the split and headcount fields specifically.
4. Constitution **Principle VII (Explicit Parameter Contracts)** applies to any new/modified functions touched in this work — named parameter object types, no inline object typing, existing violations in touched code must be corrected as part of the change.
5. Rewrite the affected component tests test-first (`tdd` skill). `tailoring-slot-list.component.test.tsx` and `$cycleId.component.test.tsx` currently assert the *old* three-separate-saves behavior and the checkbox-based inclusion control; both need real rewrites, not patches. Follow `tasks.md` Phase 8's test tasks (T040–T048b), not this file's Acceptance criteria below, which predate the correction.
6. Drive the real flow in the browser (`verify` skill) against the actual dev server — Local Ops ministry / Agosto 2026 cycle has real seeded data, including a multi-shift day and an empty-headcount day, useful for exercising the new validation state.
7. `code-review` skill pass before commit.

## Acceptance criteria *(superseded — see spec.md Success Criteria SC-007/SC-008/SC-009 and `tasks.md` Phase 8's Goal statement instead)*

- Day strip replaces the grid calendar, scrolls via drag/swipe/chevrons/**keyboard arrow keys** (keyboard added during clarification, spec.md FR-020a), and stays usable at cycle lengths well beyond one month.
- Name/time-of-day filters render in a horizontal row below the day strip; the old vertical sidebar column is gone.
- A slot can be marked Serving with zero extra clicks beyond the toggle itself (autosaves instantly).
- ~~Configuring shifts/headcounts on a row requires exactly one Save action for that row, not three.~~ **Corrected**: split saves via its own dirty-gated action; headcounts save via one combined-across-shifts action. Two independent actions per slot, not one, and not three.
- Serving=Yes + any unset headcount cannot be saved via the headcount action, and the slot explains why. The independent split save is never blocked by this.
- Local split/headcount edits survive a Serving Yes→No→Yes cycle within the same session.
- The page-level leave-confirmation guard fires for unsaved split and/or headcount edits, not just for already-successfully-saved-but-not-yet-notified participations.
- Existing "Request availability" page-level flow still fires for slots saved (either action) under the new model.
- **(Added during clarification)** A partial failure in a multi-call headcount save leaves successful values saved and only retries the failed ones — never an all-or-nothing rollback.
- **(Added during clarification)** Split and headcount fields use `@tanstack/react-form` + `zod`, reusing existing validation logic as the schema.
- All rewritten tests pass; no regression in untouched behavior (calendar's actual day-filtering logic, empty/error/forbidden states, mobile touch-target sizing).

## Do not

- Do not remove the three-layer calendar signifier system's meaning (cycle band / event dots / selected-day ring) — only its container changes from grid to strip.
- Do not silently drop or weaken the page-level leave-confirmation guard — Decision 1 makes it stricter, not optional.
- Do not persist local split/headcount edits across a page refresh or navigation-away — session-only, per Decision 2.
- Do not introduce a new backend endpoint or change existing mutation payload shapes.
- Do not use a raw `<input>` for the Serving toggle or reintroduce a shared (non-per-row) pending/loading boolean — both were fixed as P0/accessibility issues in this codebase already and would be regressions.
- Do not build a single combined split+headcount save action — this was the exact mistake this correction exists to fix.
- Do not autosave split on every field change, and do not skip the dirty-gate on the split save button.
- Do not roll back already-successful headcount writes when a sibling call in the same batch fails.
