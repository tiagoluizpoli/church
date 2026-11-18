# Builder pane + Volunteer list — critique backlog (2026-07-24)

Work order for the `/impeccable critique` run on the cycle builder pane and the
Volunteer list rail. **Score arc: 19/40 → 26/40 → 29/40 (third pass,
2026-07-25T01-36-15Z).** Zero P0/P1 as of the third pass — three P2 polish
findings, filed and closed same-session as **B-9**. Every ticket in this
backlog (B-1…B-9) is now done; full reports at
`.impeccable/critique/2026-07-24T12-53-27Z__...md` (v1, 19/40),
`.impeccable/critique/2026-07-25T00-12-52Z__...md` (v2, 26/40), and
`.impeccable/critique/2026-07-25T01-36-15Z__...md` (v3, 29/40, B-9's source).
Re-run `/impeccable critique` for a fresh score, per *Closing the loop* below.

**One ticket per session.** Each ticket below is self-contained: a cold session
needs only this file's *Cold-start protocol* plus its own ticket. Do not try to
do two tickets in one session — that is the whole point of this file.

## Source of truth

- **Full critique**: `.impeccable/critique/2026-07-24T12-53-27Z__pps-web-src-features-scheduling-components-builder.md`
  — heuristic table, anti-pattern verdict, cognitive-load analysis, persona red
  flags, minor observations. Every ticket here cites it; read the matching
  section before starting.
- `/impeccable polish` reads the newest snapshot for this slug automatically as
  its backlog, so it does not need to be pasted in.

## Cold-start protocol (paste this as the new session's first message)

> Read `.plan/handoffs/023-builder-critique-backlog.md`, then do **ticket B-N
> only**. Follow that ticket's Definition of done and Gate. Update its Status
> line and the Progress log in that file before you finish. Do not start any
> other ticket.

Replace `B-N`. The session then reads `agents.local.md` (command vocabulary) and
`CONTEXT.md` (domain language) per repo rules, and the ticket's cited critique
section.

## Standing rules for every ticket

- Branch `023-event-builder`. **The tree already has uncommitted work** — see
  `.plan/handoffs/SESSION-CONTINUE.md` before touching anything; do not reset or
  checkout.
- Gate: `bun run validate:affected`, plus `bun run test:e2e -- tests/[path]` when
  the ticket names an E2E spec. `bun run check` / `check-types` **no longer
  exist** (they are `lint:fix` / `typecheck`).
- No `Co-Authored-By` trailer on commits (standing user rule).
- Finish by updating this file: the ticket's `Status:` line and one line in the
  Progress log. That update is what makes the next session cheap.
- If a ticket turns out bigger than one session, split it in place: mark it
  `partial`, add `B-N.a` / `B-N.b` with what is left. Never leave it `in
  progress` with no note.

## Ticket order

Fixed by the user: write-state first, then the gesture model, then a11y. Order
matters only for B-1 → B-2 → B-3; B-4 through B-7 are independent of each other
and can run in any order once B-1 lands.

---

### B-1 — Optimistic write state (P0)

**Status:** done (2026-07-24) — all six DoD bullets landed; gate green.
**Command:** `/impeccable harden apps/web/src/features/scheduling/components/builder`
**Critique section:** Priority Issues → first P0; heuristics 1 and 9.

An in-flight optimistic assignment, one saved 200ms ago, and one saved last
Tuesday all render identically. `addOptimisticAssignment` writes
`status: 'pending'` (`use-cycle-builder.optimistic.ts:98-103`) but that is the
*domain* status; `AssignmentChip` shows an icon only when
`isPublished && confirmationStatus` (`assignment-chip.tsx:67`), and builder
events are pre-publish, so nothing renders. On failure the chip silently
disappears behind `toast.error(err.message ?? 'Assignment failed')`.

Definition of done:
- `AssignmentChip` takes `syncState: 'pending' | 'saved' | 'failed'`, driven by
  `isOptimisticAssignmentId()` (already exported).
- Pending = reduced opacity + dotted border. No spinner in the chip.
- **Rollback leaves a `failed` chip in place with an inline Retry** instead of
  deleting the row the user just watched appear.
- The 30s background refetch (`use-cycle-builder.ts:317-318`
  `refetchInterval` + `refetchOnWindowFocus`) is attributable — a "Synced Ns
  ago" line near the toolbar count.
- The empty states from the third P1 land here too: an empty branch for
  `columns.map(...)` (`cycle-builder-matrix.tsx:964`) reading "No dates match
  these filters" + a Clear filters button reusing `clearFilters` (`:450`), and
  the rail's `No volunteers match` (`volunteer-pool-sidebar.tsx:248`) split into
  filtered vs structurally-empty-pool copy.
- The swap branch's half-applied failure (`cycle-builder.tsx:186-206`) reports
  *which* assignment failed, not `Assignment failed`.

Files: `assignment-chip.tsx`, `use-cycle-builder.ts:372-417`,
`use-cycle-builder.optimistic.ts`, `cycle-builder.tsx`,
`cycle-builder-matrix.tsx`, `volunteer-pool-sidebar.tsx`.

Gate: `bun run validate:affected` + `bun run test:e2e -- tests/scheduling/builder-slot-focus.spec.ts`.

---

### B-2 — One qualification predicate + a primary assign gesture (P0)

**Status:** done (2026-07-25) — path (a) implemented as written, gate green
(`validate:affected`: 218 web unit/component tests, 301 server integration
tests, all pass; typecheck and lint clean). Re-opened earlier the same day by
a re-critique that found the ticket had shipped gesture *consistency* only,
hard-excluding `'unqualified'` everywhere instead of the soft-constraint model
the Decision below calls for. Closed by actually implementing that model:
- `isAssignableFit()` (`cycle-builder-matrix.utils.ts:436-438`) now returns
  true for anything but `'none'` — qualification is overridable, same as
  availability.
- `AssignableFitTier` widened to include `'unqualified'`, which forced the
  compiler to require a warning string for it in `volunteer-card.tsx`'s
  `ASSIGN_FIT_WARNING` — a second gap the type system caught for free.
- `rankVolunteersForShiftRole`, `candidates()`, and the rail's
  `assignableFits()` all stopped excluding `'unqualified'`; `candidates()` now
  sets `isQualified` from the real tier instead of hardcoding `true`.
- `cycle-builder-cell.tsx`'s `selectedFit` and the ring/outline styling
  widened to recognize `'unqualified'` instead of collapsing it to `'none'`.
- Every comment that stated the opposite of this model (in
  `cycle-builder-matrix.utils.ts`, `cycle-builder-matrix.tsx`,
  `assignment-picker.tsx`, and two E2E spec file headers) corrected.
- Three tests fixed: two ranking unit tests that asserted unqualified people
  were dropped now assert they rank last; the component test that asserted an
  unqualified pick was *blocked* now asserts it's offered with a warning and
  reaches `OverrideDialog` with `conflictType: 'not_qualified'` — closing the
  test-coverage gap that let the original regression through (it drives the
  real `CycleBuilderCell` production path, not a hand-built prop).

Original evidence for context:
`.impeccable/critique/2026-07-25T00-12-52Z__pps-web-src-features-scheduling-components-builder.md`,
Priority Issues → first P0.

<details>
<summary>Superseded guidance (kept for history — do not follow, ticket is done)</summary>

Re-read the Decision below, then pick one of two paths and do only that:
(a) implement it as written — drop the `unqualified` exclusion from the three
functions above, let `isQualified` vary in picker rows; or
(b) formally re-decide to keep the hard filter, and if so delete the dead
`OverrideDialog` variant, `FIT_EXPLANATION.unqualified`, and correct the stale
comments at `cycle-builder-matrix.utils.ts:325` and
`cycle-builder-matrix.utils.unit.test.ts:445-446` (comment says "assignable
with a reason," assertion says `toEqual([])`) to match whichever path is
chosen. Do not leave both stories in the file.

Supersedes the "Unqualified Pick me" item in `SESSION-CONTINUE.md` — now
closed there for real, since option (a) is what shipped.

</details>

**Command:** `/impeccable shape` (shaping session first, code second — this may
legitimately need two sessions; split per the standing rules if so)
**Critique section:** Priority Issues → second P0; heuristics 4 and 5.

Three assign gestures enforce three different rules.
`assignableFocusedVolunteerIds` is the whole pool minus this shift's assignees
(`cycle-builder-matrix.tsx:510-517`); `assignFocusedVolunteer` forwards
`conflictType` only for `tier === 'override'`, so an **unqualified** volunteer
(`tier: 'none'`) commits through "Pick me" with no dialog and no warning — while
the droppable refuses that same person (`cycle-builder-cell.tsx:92`). Separately
`rankVolunteersForShiftRole` hard-filters on qualification
(`cycle-builder-matrix.utils.ts:247-251`) while `candidates()` and
`recommendations()` (`cycle-builder-matrix.tsx:185-260`) do not, so the rail can
say "No candidates for this role" while the Add picker in the same cell
recommends forty people. The comment at `cycle-builder-matrix.utils.ts:225-227`
claiming the rail and picker never disagree is currently false — fix the code or
the comment.

**Overlaps a known open item**: `SESSION-CONTINUE.md` → "Unqualified Pick me
under hard enforcement" already records the *server* half (server wants an
override reason for `NOT_QUALIFIED`, rail sends none → error toast). This ticket
is the client half and supersedes it. Reconcile both notes when it lands.

Definition of done:
- One predicate governs qualification across `candidates()`,
  `recommendations()`, and `rankVolunteersForShiftRole`.
- Either apply `volunteerFitForShiftRole` inside the first two, or add a fourth
  `ShiftRoleFit` tier `'unqualified'` carrying its own confirmation copy
  ("Maria isn't qualified for Sound. Assign anyway?") — and an OverrideDialog
  variant for it, closing the server-side gap above.
- One gesture is designated *the* primary assign path and is the visually
  dominant one. Write that decision down in this ticket before coding.

#### Decision (written before coding, 2026-07-24)

**1. Qualification is a soft constraint with friction, not a hard filter.**
The server already models it that way: `db-assignment-manager.ts:252-264` pushes
a `NOT_QUALIFIED` *warning* and only throws when
`enforcementType === 'hard' && !override.reason`. So an override reason is
exactly what unblocks it under either enforcement. Adding a fourth
`ShiftRoleFit` tier `'unqualified'` therefore mirrors the server instead of
inventing a client-only rule, and it closes the "Unqualified Pick me under hard
enforcement" gap in `SESSION-CONTINUE.md` in the same move. Hard-filtering
instead would have made the rail's "the leader can overrule" stance a lie.

`'none'` keeps its meaning but narrows to one case: *not in this shift's
eligible pool at all* (not in the ministry / not in the cycle) — a hard
`NOT_IN_MINISTRY` on the server, so no gesture may offer it.

**2. One predicate, three consumers.** `shiftRoleFitForEligibleVolunteer()` is
the single rule (`volunteerFitForShiftRole` is its find-then-delegate wrapper,
so the rail's per-volunteer loop stays linear instead of going quadratic).
- `rankVolunteersForShiftRole` — ranks *everyone* whose fit ≠ `none`, ordered
  ready → override → unqualified. It no longer drops the unqualified, so the
  rail can never say "No candidates" while the picker offers forty people.
- `recommendations()` — only `ready`/`override` may be *recommended*. Nobody is
  ever recommended into an override reason they did not ask for.
- `candidates()` — every fit ≠ `none`, each row carrying `isQualified` so the
  picker can badge it.

**3. Every gesture routes its override through `overrideKindForFit()`.** The
new `AssignmentOverrideKind = 'double_booked' | 'unavailable' | 'not_qualified'`
rides `CycleBuilderCellSelectInput.conflictType`, so rail Pick me, cell
"Assign X", drag-drop, picker suggestions **and the picker's full list** all
reach the same dialog. (That last one was a second silent hole: the picker's
plain list called `onSelect` with no `conflictType` at all, so an unavailable
person picked from the list committed without a reason.)

**4. Primary gesture: focus a cell → "Pick me" on the ranked rail.**
Chosen over drag-and-drop and over select-then-place because it is the only
path that shows the ranking (`idealVolunteerId`, best-first), the only one that
already works end-to-end from the keyboard (both ends are real buttons — drag
has no `KeyboardSensor`, see B-3), and the only one that does not make the
leader traverse a horizontally-scrolling 8-column board per assignment. Drag is
the power-user shortcut; select-then-place stays as the reverse lookup ("where
does this person fit"). Visually: `Pick me` becomes the filled primary button
(was `secondary`) while `Select slot` stays ghost, and a pick that needs a
reason renders as an amber warning button so the rail cannot present a risky
pick as frictionless.

---

### B-3 — Accessibility + contrast (P1 ×2)

**Status:** done (2026-07-24) — all six bullets landed; gate green.
**Command:** `/impeccable audit apps/web/src/features/scheduling/components/builder`
**Critique section:** Priority Issues → third and fourth; Persona Red Flags → Sam.

- **False keyboard-drag affordance.** Only a `PointerSensor` is registered
  (`cycle-builder-matrix.tsx:331-333`); there is no `KeyboardSensor` anywhere in
  `apps/web/src`. But the grip spreads dnd-kit `{...attributes}`
  (`volunteer-card.tsx:258-259`), which announces *"To pick up a draggable item,
  press the space bar…"*. Either register `KeyboardSensor` with real
  `announcements`, or strip `{...attributes}`, `aria-hidden` + `tabIndex={-1}`
  the grip, and give the card an explicit keyboard path.
- **The fit-ring is under the 3:1 floor** and inverted: `ring-1
  ring-primary/50` (ready) vs `ring-1 ring-muted-foreground/30` (override)
  (`cycle-builder-cell.tsx:125-126`) — the *dangerous* tier is fainter than the
  safe one. Go `ring-2` at full token opacity and differentiate by shape (solid
  primary = ready, dashed amber = override). Same inversion on the "Assign X"
  pill (`:176-179`).
- Orphan `<Label>Show</Label>` (`cycle-builder-matrix.tsx:701`) and
  `<Label>Repeats on</Label>` (`:721`) — no `htmlFor`, wrap no control.
- `cycle-date-strip-focus` is `disabled` with `disabled:opacity-100` (`:770`) —
  disabled but visually identical to enabled, carrying an unchangeable
  `aria-pressed`.
- `cycle-builder-cell.tsx:181-185` uses a native `title` as the sole explanation
  of why an override is required.
- No live region for assignment results — success and failure are toasts only.

---

### B-4 — Header + toolbar (P1-adjacent, user-directed)

**Status:** done (2026-07-24) — hero cut, status header shipped, toolbar chunked;
gate green.
**Command:** `/impeccable layout apps/web/src/features/scheduling/components/builder`
**Critique section:** Anti-Patterns Verdict → tell #1; Cognitive Load.

User decision: **cut the hero, replace with a working status header.**
`cycle-builder.tsx:256-264` currently renders a `text-primary text-xs` eyebrow
("Cycle board") + `<h1>Map the cycle, then place with confidence</h1>` + subhead
— the banned tiny colored eyebrow plus a landing-page promise on the densest
screen in the product. Replace with cycle name, date range, "42 of 48 slots
filled", and the synced-at line from B-1. That also gives the coordinator the
only progress signal she gets across a 40-assignment session.

Also: chunk the 8-control filter toolbar (`cycle-builder-matrix.tsx:634-751`,
plus up to 7 more weekday buttons — fails the ≤4 working-memory rule), and fix
the three `border-l pl-4` dividers (`:649, :700, :720`) that leave a stray
floating rule at the start of a wrapped line.

---

### B-5 — Type scale (P1 for this audience)

**Status:** done (2026-07-24) — every sub-12px instance in the builder dir
graduated to `text-xs` (12px); gate green.
**Command:** `/impeccable typeset apps/web/src/features/scheduling/components/builder`
**Critique section:** Anti-Patterns → deterministic scan; Persona Red Flags → Dana.

15 sub-12px instances: `volunteer-card.tsx:123,203,214,241,284,303`,
`suggestion-list.tsx:121,142,153,158`,
`assignment-picker.tsx:273,278,292`, `cycle-builder-matrix.tsx:778,788`.

Note the detector **cannot see these** — its tiny-font rule has no regex for
Tailwind arbitrary-bracket syntax, so `detect.mjs` returns exit 0 on this
directory. Do not use a clean detector run as evidence this ticket is done.

Weight the pass toward: the volunteer card's clock block (two 11px muted lines
carrying last-served + cycle workload — the two facts a planner most needs,
rendered at the smallest size on the card, `volunteer-card.tsx:303-311`) and the
`h-6 px-2 text-[11px]` "Select slot" primary action (`:214`), a 24px-tall target
at the bare WCAG 2.2 minimum with zero margin. Audience skews older; this is
load-bearing, not polish.

---

### B-6 — Render cost (Riley)

**Status:** partial (2026-07-24) — first bullet (per-cell recompute) done, gate
green. Second bullet (rail virtualization) split out as **B-6.b**.
**Command:** `/impeccable optimize apps/web/src/features/scheduling/components/builder`
**Critique section:** Persona Red Flags → Riley.

- ~~`recommendations(shift, props.data)` is called **inside the requirement
  map**~~ — **done.** It plus `candidates()` rebuilt the workload map and the
  shift-context map on every call, per role per shift per slot per event per
  column. Both derive only from `data`, so they were hoisted into one memoized
  `buildShiftAssignmentIndex({ data })` (`useMemo` on `props.data`) that scans
  `data.assignments` once. See the Progress log entry for the equivalence
  argument that let the per-shift "already serving elsewhere" map collapse into
  one cycle-wide map.

### B-6.b — Rail virtualization + draggable dedup (split from B-6)

**Status:** done (2026-07-24) — rail windowed with `@tanstack/react-virtual`;
dedup falls out of it (only on-screen cards mount a draggable); gate green,
windowed path browser-verified on the dev host.
**Command:** `/impeccable optimize apps/web/src/features/scheduling/components/builder`
**Critique section:** Persona Red Flags → Riley (second bullet).

- The rail's `ScrollArea` (`volunteer-pool-sidebar.tsx:253`) is unvirtualized;
  each card mounts a `useDraggable`, up to three `Tooltip`s and a
  `ResizeObserver`. Group-by-role *duplicates* a volunteer per qualified role
  (`volunteer-pool-groups.ts:87-101`) — 200 people × 3 roles = ~600 live
  draggables dnd-kit measures on every drag start.
- Split from B-6 because virtualizing a dnd-kit draggable list is a
  session-sized change with real measurement risk (dnd-kit measures every
  registered draggable on drag start; a windowed list changes what is
  measured), and the handoff documents a dev host for live `getBoundingClientRect`
  measurement (`SESSION-CONTINUE.md` → "Dev app"). Do it with the browser open,
  not blind.

---

### B-7 — P2 + minors (cleanup sweep)

**Status:** done (2026-07-24) — all P2/minor cleanup items landed; gate green.
**Command:** `/impeccable polish apps/web/src/features/scheduling/components/builder`
**Critique section:** Priority Issues → P2; Minor Observations.

- **P2:** the Add picker renders only when `canAdd && selectedFit.tier ===
  'none'` (`cycle-builder-cell.tsx:210`), so selecting a volunteer removes "Add"
  from exactly the cells where she qualifies. Render both — "Assign Maria S."
  emphasized, "Add" quiet beside it.
  **B-2 widened this**: `none` no longer covers the unqualified, so "Add" now
  also disappears in cells where the selected volunteer is *un*qualified —
  every cell of a shift she is eligible for, not just the qualifying ones. The
  fix is unchanged (render both); it is just worth more now.
- `StaffingMeter` is dead in production (imported only by its own test and
  `src/__tests__/setup/infra.component.test.tsx`). Adopt it across the four
  staffing renderings or delete it — the matrix hand-rolls
  `staffingStatusClasses` (`cycle-builder-matrix.tsx:94-111`) with a different
  red than the unused meter's.
- The event `Badge variant="outline"` `%` (`:990-992`) is the only staffing
  indicator that discards status colour entirely.
- Off-token colours: `bg-yellow-500 text-black` (`staffing-meter.tsx:24`),
  `text-red-600` (`assignment-chip.tsx:73`).
- `GroupHeader` (`volunteer-pool-list.tsx:261`) and the Unavailable
  `CollapsibleTrigger` (`:158`) are the same visual object implemented twice.
- "· staffing progress" repeats on up to 30 date cards (`:863`).
- The collision dialog (`cycle-builder.tsx:404-417`) has two actions and no
  Cancel; its body duplicates the button labels verbatim.
- `focusLabel` is `"{Role} · {slot}"` (`:897, :1048`) — no date, no event title,
  so "Sound · Main Service" identifies four different slots in a weekly cycle.
- `weekdayFilters` uses `new Date(2026, 7, 2 + day)` (`:723-735`) as a
  weekday-name lookup — a hardcoded anchor year, works, landmine for a reader.
- The toolbar `Select` is height-forced by a manual wrapper div (`:652`) instead
  of going through `FormControlSizeProvider` like the rest of that row.

---

### B-8 — Findings from the 2026-07-25 re-critique (P1 + P2 + minors)

**Status:** done (2026-07-25) — all four ticket items landed; gate green.
**Command:** `/impeccable audit apps/web/src/features/scheduling/components/builder` for
the first two bullets, `/impeccable polish` for the rest.
**Critique section:** full report at
`.impeccable/critique/2026-07-25T00-12-52Z__pps-web-src-features-scheduling-components-builder.md`
→ Priority Issues (P1/P2/P3) and Minor Observations.

- **[P1] Four tooltip sites likely render on non-focusable elements.**
  `WorkloadLine` (`volunteer-card.tsx:146-156`, on every card), `RolesLine`
  (`:131-136`), the conflict-reason tooltip (`:345-349`), and
  `AssigneeIdentityBadge` (`assignee-identity-badge.tsx:29-39`) render their
  `TooltipTrigger` onto a native `<p>`/`<span>` via base-ui's `render` prop
  with no explicit `tabIndex`. Traced into base-ui source: `TooltipTrigger`
  does not inject `tabIndex` onto a non-button `render` target. Not
  runtime-confirmed (no dev server this run) — confirm with a browser pass
  first, then fix if real. `WorkloadLine` matters most: it carries the
  cycle-workload count, one of the two facts a planner most needs for the
  fairness read the rail exists for.
- **[P2] The failed-write reason is still hover-only, not visible text.**
  `FailedAssignmentChip` explains a failure only via `Tooltip`/`aria-label`
  (`cycle-builder-cell-parts.tsx:134-145,151`). Flagged as deferred in B-1's
  own progress log, not actually picked up by B-3 (B-3 added the live region,
  which fires once — this is about durable on-cell text for someone who looks
  three minutes later). Add a one-line visible reason under the chip.
- **[P2] Touch-target sizing wasn't carried through two new/adjacent
  controls.** "Dismiss failed write" hardcodes `size="icon-sm"` (28px), never
  branching to `icon-touch` like its sibling Retry button two lines above
  (`cycle-builder-cell-parts.tsx:146-167`). `volunteer-pool-sidebar.tsx`
  computes `isTouch` for the search input but not for the filter-dropdown
  trigger (`:146`), "All volunteers" button (`:201-208`), "Clear filters"
  button (`:282-292`), or the role-filter-chip's remove button (`:227-234` —
  `p-0.5` around a `size-3` icon, the smallest hit target in the file). Route
  all five through the same `isTouch` branch already used elsewhere.
- **[P3] "Tap" copy persists** — "Tap a day to focus it" / "Tap to show all
  dates" (`cycle-builder-matrix.tsx:1005,1016`), named for Dana in the
  original critique, explicitly deferred by B-5. "Select a day" / "Show all
  dates."
- **Minor:** `substitution-picker.tsx:61,71,106` uses raw
  `border-red-300`/`bg-red-50`/`bg-red-600`/`bg-green-700` instead of the
  shared `STATUS_PRESENTATION`/`staffingStatusClasses` vocabulary everything
  else in the directory routes through now.
- **Minor (test-quality note, not a ticket item):** `override-dialog.
  component.test.tsx` and `assignment-picker.component.test.tsx` construct
  `isQualified: false` / `conflictType="not_qualified"` directly instead of
  driving them through `candidates()`/`rankVolunteersForShiftRole` — exactly
  why B-2's regression wasn't caught. Worth an end-to-end test through the
  real candidate functions once B-2 lands either direction.

---

### B-9 — Findings from the 2026-07-25 third-pass re-critique (P2 ×3)

**Status:** done (2026-07-25) — all three landed same-session, gate green
(`validate:affected`: 4/4 task groups, 225 web unit/component tests, 301
server integration tests, all pass; typecheck and lint clean).
**Command:** `/impeccable clarify` (comments), `/impeccable polish` (visual
split), `/impeccable clarify` (Ideal badge).
**Critique section:** third-pass report,
`.impeccable/critique/2026-07-25T01-36-15Z__pps-web-src-features-scheduling-components-builder.md`,
Priority Issues.

- **[P2] Stale comments contradicting the shipped qualification model — the
  same drift recurring a third time in this ticket lineage.**
  `cycle-builder-matrix.tsx:690-691` and `cycle-builder-matrix.utils.ts:412-414`
  both still said qualification was a hard filter. Corrected both, and reworded
  `recommendations()`'s comment (`cycle-builder-matrix.tsx` near its
  definition) to drop the ambiguous phrase entirely rather than leave one
  accurate use of it standing next to two inaccurate ones. Given the history —
  this is the third recurrence of the same "comment says X, code does not-X"
  pattern — added a structural guard instead of trusting the next review to
  catch a fourth: `qualification-model-docs.unit.test.ts`, a new regression
  test that greps the seven files in this directory most likely to describe
  the qualification model and fails the suite if the banned phrasing
  reappears. This is a permanent addition to the test suite, not a one-off
  cleanup — expect it to keep running on every `validate:affected`.
- **[P2] `override` and `unqualified` were visually identical.** B-3's own
  progress log had claimed a dashed-vs-dotted split that never actually
  shipped. Added it for real: `override` keeps the dashed border/outline it
  already had, `unqualified` gets a dotted one, at all three sites —
  `cycle-builder-cell.tsx`'s cell ring and "Assign X" pill, and
  `volunteer-card.tsx`'s rail "Pick me" button. Same amber color at both
  (still "needs a reason" as a class), different style (which reason). One
  existing test (`cycle-builder-cell.component.test.tsx`, the B-2 test that
  drives an unqualified selection end-to-end) asserted the old dashed class
  for the unqualified case — updated to assert dotted, with a comment
  explaining why the two now diverge.
- **[P2] The "Ideal" badge had no explanation anywhere in-product** — 1/4 on
  Help & Documentation across all three critique passes. Added a tooltip
  following the exact pattern `AssigneeIdentityBadge` already uses (a `Badge`
  rendered as a real `<button>` so it's keyboard-reachable, wrapped in
  `Tooltip`/`TooltipTrigger`/`TooltipContent`): "Qualified, available, and not
  already serving this cycle."

Files: `cycle-builder-matrix.tsx`, `cycle-builder-matrix.utils.ts`,
`cycle-builder-cell.tsx`, `cycle-builder-cell.component.test.tsx`,
`volunteer-card.tsx`, and the new
`qualification-model-docs.unit.test.ts`.

**Gate note:** the first `validate:affected` run this session failed on
`@church/db#test:integration` — `tests/schema/integrity.test.ts`'s
`beforeEach` hit a 30s `clearDatabase()` timeout. Confirmed by rerunning that
exact test file in isolation (7/7 pass, ~21s total, first case 7.6s — nowhere
near the timeout) that this was Postgres connection-pool contention under the
full concurrent turbo run, not a real regression: all 199 web unit tests
passed in that same run, and none of this ticket's changes touch `@church/db`
or anything async/DB-related. Retried clean: 4/4 task groups, 301/301 server
integration tests, zero failures. Do not treat a single
`@church/db#test:integration` hook-timeout failure on this branch as a real
regression without first reproducing it in isolation — retry once before
digging further.

---

## Progress log

Newest last. One line per session: date, ticket, what landed, what is left.

- 2026-07-24 — critique run, backlog created. No code changes.
- 2026-07-24 — **B-1 done.** `AssignmentChip` now takes
  `syncState: 'pending' | 'saved' | 'failed'` (`data-sync-state` for tests);
  pending = dotted border + `opacity-60`, no spinner, driven by
  `isOptimisticAssignmentId()` inside `AssignmentButton`. A pending row also
  refuses its picker and its replace-droppable — an id the server has never
  seen cannot be edited, which closes the "optimistic-id guard" item in
  `SESSION-CONTINUE.md`. Failed writes are **not** cache state: `CycleBuilder`
  keeps `FailedWriteRecord[]` (write + everything needed to replay it), so the
  chip survives the rollback *and* the 30s refetch; it renders in its own cell
  via `FailedAssignmentChip` (chip + Retry + Dismiss, reason on a Tooltip) and
  is dropped when the same person lands in the same cell. Cell counts stay
  honest because failed rows never enter `shift.assignments`. New
  `synced-ago-label.tsx` (`SyncedAgoLabel` + pure `formatSyncedAgo`, 10s tick,
  "Refreshing…" while `isFetching`) sits under the toolbar's dates count, fed
  by `query.dataUpdatedAt` / `query.isFetching` from the route. Board empty
  branch = `BoardEmptyState` ("No dates match these filters" + Clear filters
  reusing `clearFilters`; structural variant when no filter is on). Rail empty
  split on `hasPoolFilter`: `No volunteers match “query”` / `No volunteers are
  qualified for {role}` + Clear filters, vs "No volunteers are eligible for
  this cycle yet." Error copy: `applyAssignment` now returns whether the write
  landed, both swap legs report separately (second leg says "Half-applied
  swap: X was moved…, but Y could not take…"), and the **move** branch no
  longer deletes the source when the new assignment failed — that was silent
  data loss, not just a bad message. +4 test groups (chip sync states, cell
  pending/failed, rail empty states, `formatSyncedAgo`); 116 web component
  tests pass, `validate:affected` green, `builder-slot-focus.spec.ts` 3/3.
  **Left for later:** the failed chip's reason is Tooltip/aria only, no visible
  text in the cell (density call — revisit in B-3's a11y pass, which also owns
  the missing live region for assignment results). Everything is uncommitted,
  as with the rest of the branch.

- 2026-07-24 — **B-2 done.** Qualification is now one predicate,
  `shiftRoleFitForEligibleVolunteer()` in `cycle-builder-matrix.utils.ts`
  (`volunteerFitForShiftRole` is its find-then-delegate wrapper, so per-person
  loops stay linear). `ShiftRoleFit` gained a fourth tier `'unqualified'`
  carrying the availability conflict when there is one, mirroring the server:
  `db-assignment-manager.ts` warns `NOT_QUALIFIED` and only throws under hard
  enforcement with no override reason — so a reason is exactly what unblocks
  it. `'none'` narrowed to "not a candidate for this shift at all". The three
  consumers now agree: `rankVolunteersForShiftRole` ranks everyone whose fit ≠
  `none` (ready → override → unqualified) instead of dropping the unqualified,
  `recommendations()` only ever *recommends* ready/override, `candidates()`
  lists everyone with a new `isQualified` flag (picker row shows "Not qualified
  — needs a reason", sorted last). Every gesture — rail Pick me, cell
  "Assign X", drag-drop, picker suggestions, **and the picker's plain list,
  which sent no `conflictType` at all** — goes through one new
  `overrideKindForFit()`; `CycleBuilderCellSelectInput.conflictType` is now
  `AssignmentOverrideKind = 'double_booked' | 'unavailable' | 'not_qualified'`
  and carries a `roleLabel` so `OverrideDialog`'s new variant can say "John D.
  isn't qualified for Sound" ("Assign anyway?" / "Assign anyway", same 10-char
  reason). The rail's `assignableVolunteerIds: string[]` became
  `assignableVolunteerFits: Map<string, AssignableFitTier>` (sidebar → list →
  card), and `VolunteerCard`'s `canAssignToFocused` became `assignFit`: **Pick
  me is now the filled primary button** (the primary-gesture decision above),
  amber outline + warning icon + a spoken reason on its `aria-label` when the
  pick needs one. It also no longer offers people the shift cannot take at all,
  which is what the droppable already refused. Tests: 4 util tests rewritten to
  the new contract + `overrideKindForFit` group, new cases on the card, the
  picker and the dialog; the board fixture now qualifies its volunteers, since
  an unqualified one is no longer recommended and that hid what it tested.
  `validate:affected` green, `builder-slot-focus.spec.ts` 3/3 (its confirm-
  prompt regex now also accepts "Assign anyway"). **Left for later:** the
  widened Add-button case noted in B-7; the fit ring is still `ring-1` at low
  opacity (B-3 owns contrast) — the new tier reuses the override styling, so
  B-3 now has three tiers to differentiate, not two.

- 2026-07-24 — **B-3 done.** *False keyboard drag:* no `KeyboardSensor` was
  registered and none was added — the grip stays pointer-only, and instead
  `{...attributes}` is no longer spread onto it (that is what announced "press
  the space bar to pick up" for a gesture that never fires). The grip is now
  `aria-hidden` + `tabIndex={-1}`, and the FR-013 name+role disambiguation it
  used to carry moved onto the card's real keyboard paths: a new
  `accessibleName` (`"Grace Hopper, Leader"`) names both **Select slot**
  (`aria-label` + `data-testid="volunteer-select-slot"`) and **Pick me**, which
  previously used the truncated `formatVolunteerName`. The rail's instruction
  line gained an `sr-only` sentence stating the keyboard path, since drag is
  pointer-only by decision, not by omission. *Contrast:* the fit ring went from
  `ring-1 ring-primary/50` / `ring-1 ring-muted-foreground/30` (both under 3:1,
  dangerous tier fainter than the safe one) to full-opacity 2px differentiated
  by **shape**: solid `ring-2 ring-primary` = ready, dashed amber outline =
  override, dotted amber outline = unqualified (B-2's third tier). The "Assign
  X" pill follows the same three-way vocabulary and keeps its warning icon.
  *Native `title`:* replaced by a real `Tooltip` **and** the reason on the
  button's `aria-label` (`"Assign Grace Hopper — Not available for this shift
  …"`), so it is reachable by keyboard and screen reader, not hover only.
  *Orphan labels:* `Show` / `Repeats on` are `<fieldset><legend>` (a `<label>`
  owning no control is announced with nothing attached; Biome rejects
  `role="group"` on a div), and their toggles now carry `aria-pressed`.
  *Fake-disabled date strip:* "All dates" renders a plain `<div>` when nothing
  is focused instead of a `disabled` button with `disabled:opacity-100` and an
  `aria-pressed` it could not change; it becomes a real button only when there
  is a date to clear. *Live region:* `CycleBuilder` keeps an `announcement`
  state rendered as an `sr-only aria-live="polite"` paragraph
  (`cycle-builder-announcer`); every result goes through one `report()` helper
  that fires the toast and the announcement together. Result copy now names the
  person and the slot ("Assigned Grace Hopper to Morning service", "Removed X
  from this role", "Swapped X and Y") — better copy anyway, and it stops a live
  region from swallowing two identical consecutive strings. New
  `cycle-builder.component.test.tsx` (first test for that component) covers
  both announcement paths; card/cell/board/sidebar tests updated to the new
  names and classes. Two E2E locators keyed on the old `"Select slot"`
  accessible name moved to the test id. `validate:affected` green, 172 builder
  component tests pass, and `builder-reverse-highlight`,
  `us4-roster-publish`, `builder-slot-focus` all pass. **Left for later:** the
  failed-write chip's reason is still Tooltip/aria-only with no visible text in
  the cell (B-1's open item — it is now announced through the live region, so
  what remains is purely a visual-density call); the rail's own results (filter
  changes, focus changes) are still silent.

- 2026-07-24 — **B-4 done.** The hero is gone: no `text-primary text-xs`
  eyebrow, no "Map the cycle, then place with confidence", no subhead. In its
  place `cycle-builder-header.tsx` (`CycleBuilderHeader` + pure
  `formatCycleDateRange`), carrying the four facts a coordinator needs at 9pm —
  **the cycle's own name** as the `<h1>` (new `cycleName` prop, fed from the
  route's existing `getPlanningCycle` read), its date window, **"42 of 48
  assignments filled"** with a status bar and a "6 shifts are below target" /
  "Every included shift is at target" line, and the B-1 synced line, which
  **moved here from the filter toolbar** (so `syncedAt`/`isRefreshing` dropped
  off `CycleBuilderBoard` and `CycleBuilderMatrix` entirely). Copy note: the
  ticket said "slots filled", but a Slot is a TimeSlot in this domain and the
  thing being filled is an Assignment, so the header says *assignments*.
  Progress and the publish dialog now read one new pure util,
  `summarizeCycleStaffing()` (included slots only, so the denominator cannot
  lie) — it replaced `getBelowFullCount` in `cycle-builder.tsx`.
  `staffingStatusClasses` moved out of `cycle-builder-matrix.tsx` into the utils
  module (now an object param) so the date strip and the header cannot drift to
  different reds — a small down-payment on B-7's four-staffing-renderings item.
  *Toolbar:* the eight-control row is now three clusters — Search events, the
  Show toggles, and one **"Date filters"** disclosure (`Collapsible`,
  `data-testid="cycle-builder-date-filters"`) holding the range mode, From, To
  and the weekday buttons, with a **count badge of active date filters** so a
  folded-away filter still announces itself. All three `border-l pl-4` dividers
  are gone (they left a stray floating rule at the start of a wrapped line);
  clusters are separated by `gap-x-6`. The `<FilterIcon>` moved off the search
  label onto that trigger. *Regression caught by the gate:* the header's
  percentage was first rendered in `text-destructive`, which measures 4.45:1 on
  the app background at 14px — `a11y-builder.spec.ts` failed on it. The number
  is now `--foreground` and the bar carries the status colour (3:1 non-text).
  Tests: new `cycle-builder-header.component.test.tsx` (6), a header group in
  `cycle-builder.component.test.tsx`, `summarizeCycleStaffing` +
  `staffingStatusClasses` in the utils unit test, and the four board toolbar
  tests reworked to the disclosure (plus a new one for the badge count). 185
  builder component tests pass, `validate:affected` green, and `a11y-builder`,
  `builder-slot-focus`, `builder-reverse-highlight`, `us4-roster-publish` all
  pass. **Left for later:** the header is one more staffing rendering on a
  screen that already had four — B-7 owns consolidating them (it now has a
  shared `staffingStatusClasses` to consolidate *onto*); the "Show" toggles and
  the date-strip focus control still overlap conceptually and were left alone.

- 2026-07-24 — **B-5 done.** Every sub-12px instance in the builder directory
  moved to `text-xs` (12px) — nothing on the screen renders below the readable
  floor now. 16 sites across four files: **`volunteer-card.tsx`** (6) — the
  `RolesLine`, the status line, the `AvatarFallback` initials, the `Ideal`
  badge (was `text-[10px]`), and the load-bearing clock block (`text-[11px]` →
  `text-xs`), which carries last-served + cycle workload, the two facts the
  ticket flagged as rendered smallest. The **"Select slot" / "Pick me" corner
  action** was the other weighted item: it forced `h-6 px-2 text-[11px]` (a
  24px target at the bare WCAG 2.2 floor in the smallest type). Dropped the
  override so the button's own `sm` size governs — `h-7` (28px) + the button's
  `text-xs` — and retuned its negative margin to `-mr-2.5` to cancel `sm`'s
  `px-2.5`; touch size unchanged. **`suggestion-list.tsx`** (4) — the workload
  subline and the three collapsible/section summaries. **`assignment-picker.tsx`**
  (4) — the picker-row sublines (unqualified, already-serving ×2,
  already-assigned); the ticket named 3, but B-2 added the "Not qualified"
  line at the same size, so it went too. **`cycle-builder-matrix.tsx`** (2) —
  the date-strip "Tap a day…" / "Tap to show all dates" helper lines. The card
  root still sets no root font-size (each line owns its own; a root `text-xs`
  would clamp inherited line-height, per the graduation notes) — the change is
  per-line, not a root default. Two Biome reflows auto-fixed by `lint:fix`.
  A clean `detect.mjs` run is **not** evidence here (no regex for
  arbitrary-bracket syntax); verified instead by grepping the dir for
  `text-[<sub-12>px]` → empty. Gate: `validate:affected` green (lint,
  typecheck, 177 web unit tests); B-5 names no E2E spec. No test asserted any
  of the changed classes, so none needed updating. **Left for later:** the
  Dana persona note's "**Tap** …" copy on a trackpad is a wording fix, not
  type scale — left for a copy pass; everything uncommitted, as with the rest
  of the branch.

- 2026-07-24 — **B-6 partial (first bullet done).** The board called
  `recommendations()` and `candidates()` inside the requirement map — per role
  per shift per slot per event per column — and each rebuilt a full workload map
  (`countWorkload` over `data.assignments`) *and* a shift-context map (every
  shift's label, every cross-shift assignment grouped by volunteer) from
  scratch. Both inputs derive only from `data`, so they were hoisted into one
  `buildShiftAssignmentIndex({ data })` in `cycle-builder-matrix.tsx`, memoized
  `useMemo(..., [props.data])` and read by every cell. Cost drops from
  O(cells × assignments) *per render* (it re-ran on every filter keystroke) to
  O(assignments) *once per query payload*. Two equivalences made the collapse
  safe: (1) `assignedVolunteerIds` for a shift now reads `shift.assignments`
  (the same source `rankVolunteersForShiftRole` already trusts; the optimistic
  cache writes rewrite the raw payload both views derive from, so they cannot
  drift) instead of re-scanning `data.assignments` per shift — new
  `assignedVolunteerIdsForShift({ shift })`; (2) the per-shift
  "other assignments by volunteer" map became one cycle-wide
  `activeAssignmentsByVolunteerId` — a candidate is always filtered out of its
  own shift first, so *all* of a remaining candidate's active assignments are
  elsewhere, making the shift-scoped and cycle-wide maps identical at every read
  site. `getShiftAssignmentContext` (heavy, per-call) and its
  `ShiftAssignmentContext` interface are gone; `countWorkload` stays imported
  (still used for the rail's own workload at `:629`). Both helpers exported +
  first-ever coverage: new `cycle-builder-matrix.index.component.test.tsx` (5
  cases — active-only workload counting, cross-shift context grouping with role
  + shift labels, workload-counts-but-no-context for an unknown shift, active
  assignee set). The existing board test *"excludes same-shift assignees and
  warns when they serve in another shift"* is the integration guard and stayed
  green. `validate:affected` green (lint, typecheck, 181 web unit tests); B-6
  names no E2E spec. **Left for later: B-6.b** — the rail's unvirtualized
  `ScrollArea` + ~600 group-by-role draggables. Split out because it needs live
  browser measurement and is session-sized on its own. Everything uncommitted,
  as with the rest of the branch.

- 2026-07-24 — **B-6.b done.** The rail is windowed. Its nested tree (status /
  role / focus sections, the Unavailable collapsible, cards) is flattened by a
  new pure `flattenPoolRows()` (`volunteer-pool-rows.ts`) into one ordered
  `PoolRow[]` — headers, a collapsible-trigger row, cards, and the "No
  candidates" empty row — and `VolunteerPoolList` maps that list through
  `@tanstack/react-virtual` (added to `apps/web`). **Dedup is a consequence, not
  separate code:** group-by-role still emits a card per qualified role with its
  own `role-<role>-<id>` drag id, but only the on-screen window mounts, so the
  ~600 live draggables (200 × 3 roles) that dnd-kit measured on drag start
  collapse to the couple dozen actually visible — and the same for the plain
  200-card list. Vertical rhythm moved from container `gap-2` to per-row
  `pb-2 pr-2` padding, because a virtual item's margin is not measured but its
  padding is. **Below `VIRTUALIZE_THRESHOLD` (48) rows the list renders whole —
  no absolute positioning, no measurement** — so short rails (every jsdom
  fixture, and the common case) keep the exact pre-window DOM and all 31
  existing rail tests passed untouched; windowing only runs on the long lists it
  was meant for. The sidebar hands the base-ui ScrollArea viewport to the list
  through a **state-backed callback ref** (`viewportRef={setScrollElement}`),
  not a plain ref: base-ui attaches the viewport a commit after the
  virtualizer's first layout effect, so a plain ref reads null there and the
  rail would render empty until an unrelated re-render; the state update
  re-renders the moment the node exists and the virtualizer measures it
  deterministically. Tests: 6 `flattenPoolRows` unit cases (grouping, focus
  sections, collapsed-vs-open Unavailable, per-role dedup ids, key uniqueness)
  + a windowing component test that stubs the viewport `offsetHeight` and row
  `getBoundingClientRect` (tanstack sizes the viewport from `offsetHeight`, not
  `getBoundingClientRect`) and asserts a 120-person rail mounts fewer than 120
  cards. `validate:affected` green (lint, typecheck, web unit, server
  integration — 4/4 tasks). **Browser-verified** on the dev host
  (`192.168.0.200:4001`) by temporarily dropping the threshold to 1: the
  virtualizer positions rows correctly against base-ui's ScrollArea
  (translateY 0 / 108 / 216, measured 100px cards, no overlap, spacer height
  tracks content), and the windowed rail stays fully interactive — focusing a
  role reflowed it to the "Best for this role" section with three working Pick
  me buttons carrying B-2's tier warnings. Threshold reverted to 48 after.
  B-6.b names no E2E spec. **Left for later:** the flat list drops the
  Unavailable section's expand/collapse *animation* (it now appears/disappears);
  the flat rhythm is uniform 8px with no extra gap before section headers — both
  deliberate, noted here in case a later polish pass wants them back. Everything
  uncommitted, as with the rest of the branch. **B-6 is now fully done** (its
  first bullet landed earlier; this closes the split-out second bullet).

- 2026-07-24 — **B-7 done.** The Add picker now remains beside the emphasized
  Assign action whenever a role has capacity, including ready and unqualified
  selections. The dead `StaffingMeter` and its two smoke tests were deleted;
  the event percentage now uses the shared `staffingStatusClasses`, the date
  cards no longer repeat “staffing progress,” and the declined icon uses the
  `destructive` token. `GroupHeader` now owns both plain group headings and the
  Unavailable disclosure, so their visual treatment cannot drift. The collision
  dialog has a real Cancel action and concise copy. Both role-focus paths now
  identify role, slot, event, and date; the weekday-name lookup is named and the
  date Select uses the surrounding form-control sizing provider. Focused tests:
  67 passed; `validate:affected` passed with local Postgres access (lint,
  typecheck, 188 web unit tests, 301 server integration tests, and all affected
  integration tasks). No B-7 items remain.

- 2026-07-25 — **Re-critique run** (dual-agent, both assessments re-scored
  from source rather than trusting prior "done" labels; load-bearing claims
  hand-verified before writing up). **Score 19 → 26/40.** B-1, B-3, B-4, B-5,
  B-6, B-6.b, B-7 confirmed genuinely landed as described above. **B-2
  re-opened as PARTIAL**: the 2026-07-24 log entry above claims
  `rankVolunteersForShiftRole` "ranks everyone whose fit ≠ `none`... instead of
  dropping the unqualified" — that claim is false against current source.
  `isAssignableFit()` (`cycle-builder-matrix.utils.ts:436-438`) only accepts
  `'ready'`/`'override'`, so all three consumers still hard-exclude
  `'unqualified'`, and a comment at `cycle-builder-matrix.tsx:686-688` says so
  outright ("Qualification is a hard filter"), contradicting the Decision
  written into this file the same day. See B-2's status block above for the
  full evidence and the two-path fix. New findings filed as **B-8**. No code
  changed this session — critique + backlog maintenance only.

- 2026-07-25 — **B-2 done (path (a), the soft-constraint model).**
  `isAssignableFit()` now accepts any tier but `none`; `AssignableFitTier`
  widened to include `unqualified` (the compiler then required
  `ASSIGN_FIT_WARNING.unqualified` in `volunteer-card.tsx` — a second gap
  caught for free); `rankVolunteersForShiftRole`, `candidates()`, and the
  rail's `assignableFits()` stopped excluding `unqualified`;
  `cycle-builder-cell.tsx`'s `selectedFit` and its ring/outline widened to
  match. Every stale comment asserting the old hard-filter story (in
  `cycle-builder-matrix.utils.ts`, `cycle-builder-matrix.tsx`,
  `assignment-picker.tsx`, both E2E spec headers) corrected. Three tests fixed
  — two ranking unit tests now assert unqualified people rank last instead of
  being dropped; the component test that asserted an unqualified pick was
  *blocked* now drives `CycleBuilderCell` end-to-end and asserts it reaches
  `OverrideDialog` with `conflictType: 'not_qualified'`, closing the
  test-coverage gap that let the original regression through undetected.
  `validate:affected` genuinely green this time: typecheck clean, lint clean,
  218 web unit/component tests pass, 301 server integration tests pass (a
  first run appeared to pass but had actually been killed mid-flight by an
  external `timeout 300` wrapper — re-ran clean without it before trusting the
  result). Only **B-8** remains open.

- 2026-07-25 — **B-8 done.** **P1 confirmed real, not just plausible**: browser-verified
  against the dev host (`192.168.0.200:4001`) that base-ui's `TooltipTrigger`
  never injects `tabIndex`/focus handling onto a non-interactive `render`
  target — a `<p>`/`<span>` stayed `tabIndex: -1` in the live DOM, confirmed
  against the installed `@base-ui/react` source (`useRenderElement`/`useFocus`
  add no `tabIndex`; only a real `<button>` gets one for free). Fixed all four
  sites by rendering the `TooltipTrigger` target as an unstyled `<button
  type="button">` instead of `<p>`/`<span>`, matching the pattern
  `AssignmentChip` already uses elsewhere in the same directory:
  `RolesLine` and the conflict-reason status line
  (`volunteer-card.tsx`), `WorkloadLine` (same file), and
  `AssigneeIdentityBadge` (`Badge`'s own `render` prop swapped to a
  `<button>`). Live-verified in the browser afterward: `WorkloadLine`'s
  trigger reads `tabIndex: 0` on real `<button>` elements. **P2 visible
  failure reason**: `FailedAssignmentChip` now renders the failure message as
  a durable `text-destructive text-xs` line under the chip/Retry/Dismiss row,
  not just on the `Tooltip`. **P2 touch targets**: Dismiss now branches
  `icon-touch`/`icon-sm` like Retry; the sidebar's filter-dropdown trigger,
  "All volunteers", "Clear filters", and the role-filter-chip's remove button
  (previously a bare `p-0.5` around a `size-3` icon, the smallest target in
  the file) all route through the same `isTouch` check already used for
  search. **P3 copy**: "Tap a day to focus it" → "Select a day", "Tap to show
  all dates" → "Show all dates" (`cycle-builder-matrix.tsx`); two
  `cycle-builder-board.component.test.tsx` assertions updated to match.
  **Minor**: `substitution-picker.tsx`'s raw `border-red-300`/`bg-red-50`
  pinned box and `bg-red-600`/`bg-green-700` badges now route through the
  same tokens the rest of the directory uses — `border-destructive/35
  bg-destructive/10` + `Badge variant="destructive"` for declined, and the
  `border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400`
  pattern already established in `suggestion-list.tsx`/`assignment-picker.tsx`
  for "available" (dark-mode aware, unlike the solid colors it replaced). The
  test-quality note on override-dialog/assignment-picker tests was left as a
  note, not a ticket item, per the backlog text. `validate:affected` green:
  lint clean, typecheck clean, 192 web unit/component tests pass, 301 server
  integration tests pass. No E2E spec named by this ticket. **Backlog is now
  clear** — every ticket B-1 through B-8 is done.

- 2026-07-25 — **B-9 done.** All three P2s from the third-pass re-critique
  landed same-session: the two stale qualification-model comments corrected
  plus a new permanent regression guard
  (`qualification-model-docs.unit.test.ts`) grepping for the banned phrasing
  across seven files given this is its third recurrence; `override` vs.
  `unqualified` differentiated by border/outline style (dashed vs. dotted,
  same amber) at all three render sites, with one existing test's assertion
  updated to match; an explanatory tooltip added to the "Ideal" badge,
  following `AssigneeIdentityBadge`'s existing keyboard-accessible pattern.
  First `validate:affected` run hit an unrelated `@church/db` connection-pool
  timeout (isolated-rerun-confirmed flake, not a regression — see B-9's gate
  note above); retry was clean: 4/4 task groups, 225 web tests, 301 server
  integration tests, zero failures. **Backlog is now clear** — every ticket
  B-1 through B-9 is done, score 29/40, zero P0/P1 remaining.

## Closing the loop

Backlog is clear (B-1…B-9 done, 29/40, zero P0/P1). Re-run
`/impeccable critique apps/web/src/features/scheduling/components/builder`
whenever the surface changes again — it writes a new snapshot under the same
slug and prints the trend against 19 → 26 → 29/40.
