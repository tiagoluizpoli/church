# Grilling Session: Rail Variants AE–AI (availability-aware volunteer rail)

Date: 2026-07-17
Status: complete
Source Skill: grill-with-docs
Scope: Design lockdown for 5 new throwaway prototype rail variants (AE–AI) in
apps/web/src/features/scheduling/components/cycle-board-prototype, bundling drag
handle + avatar + human recency + cycle-count + slot-level availability + a
coherent "Ideal" badge, plus a filter/group control and a slot-driven,
bidirectional rail. Prototype only (mock data, no backend).

## Starting Context

- User prompt: 5 more rail variants bundling liked pieces (⋮⋮ grip, avatar,
  "last served N weeks ago", cycle-assignment count, availability, coherent
  top-suggestion badge replacing flame/"Coldest"); rail becomes a helper driven by
  selecting a slot; add filter icon (show-all / group-by-role); grill first.
- Confirmed before grilling: append AE–AI; keep A–AD; throwaway/mock; avatar =
  initials fallback (no photos); availability = slot-level; badge "Ideal"
  (invariant EN/PT-BR); filter/group = show-all vs group-by-role, extensible.
- Key facts:
  - REAL builder data already carries slot-level availability: cycle-builder-matrix.tsx
    builds `eligibleVolunteers` PER SHIFT (isAvailable, hasConflict, lastServedAt)
    + computed workload; `recommendations()` ranks `safe` by lastServedAt then
    workload → "Ideal" ≈ recommendations().safe[0].
  - REAL cells already call onFocus → setFocused(ids); the sidebar consumes
    focusedVolunteerIds/focusLabel. Existing seam for "select a slot drives rail."
  - REAL builder keeps unavailable/conflict volunteers assignable via override.

## Locked Decisions

- MODEL — rail = bidirectional navigation helper:
  - Selection unit = a slot cell (the requirement box; date+slot+role). Clicking
    the box BACKGROUND selects it → rail recomputes for that slot. The inner
    `+ Add` pill and assigned-volunteer pills remain the direct assign/interact
    controls (assumption from user's description; confirm vs screenshot).
  - Reverse: selecting a VOLUNTEER highlights every board cell they fit —
    strong for available+eligible, faint for eligible-but-unavailable.
  - No selection → general fairness/availability list; no "Ideal" badge.
- BADGE ("Ideal"): ≤1 per rail context; rank available → longest-since-served →
  lowest cycle load → name; only with a slot context.
- DEFAULT (no selection): neutral fairness list, plain availability status, no badge.
- COMPOSITION: search → group-by-role → selected-slot availability/order → badge
  within visible/eligible set. All stack, in that order.
- UNAVAILABLE/CONFLICT: keep visible but dimmed + marked, still draggable
  (override), never "Ideal".
- ARCHETYPES: AE rich row · AF avatar card · AG grouped-by-role · AH availability-
  split (available-for-selected-slot vs not) · AI compact leader-focus.
- MOCK SHAPE: mirror real per-shift eligibleVolunteers (isAvailable, hasConflict,
  lastServedAt, workload) + add roles[] for group-by-role.

## Current Question

None — grilling complete (batches 1–3 answered). Handoff written to
.plan/handoffs/grill-to-prd-rail-variants-ae-ai.md.

## Future Questions

(none — queue empty)

## Answered Questions

### Q1 — select granularity
Answer: slot cell is the selectable unit (date+slot at once); nothing selected →
general list; make the rail a bidirectional helper (existing "click person →
highlight assignable cells" behavior). Decision: model above. Spawned Q6, Q7;
pruned Q2.

### Q2 — one list, multi-slot day
Answer: "Q1 changed this; re-evaluate / move on." Decision: RESOLVED by Q1 →
Pruned (selected slot = single context; default = general status only).

### Q3 — badge scope & tie-break
Answer: "yes." Decision: ≤1 badge; available → recency → load → name; only with slot context.

### Q4 — no-selection default
Answer: "A." Decision: neutral fairness list, plain status, no badge.

### Q5 — composition precedence
Answer: "yes." Decision: search → group → slot-availability/order → badge, stacked.

### Q6 — select vs assign on a cell
Answer: The "cell" = the requirement/shift box (red square). Clicking the box
itself updates the volunteer list; the `+ Add` pill and volunteer pills inside are
the direct assign/interact controls (the box is also the drop area). Decision:
click box background = select slot → recompute rail; pills = assign; whole box
stays a droppable. (Assumption pending the screenshot.)

### Q7 — reverse highlight
Answer: "A." Decision: select volunteer → strong highlight on available+eligible
cells, faint on eligible-but-unavailable.

### Q8 — unavailable/conflict in rail
Answer: "A." Decision: dimmed + marked, still draggable (override), never Ideal.

### Q9 — 5 archetypes
Answer: "yes." Decision: AE/AF/AG/AH/AI as listed.

### Q10 — mock-data shape
Answer: "A." Decision: mirror real per-shift shape + roles[].

### Q11 — prototype-only vs graduate
Answer: "all for graduate." Decision: Ideal badge, slot-select-drives-rail,
reverse highlight, group-by-role all intended to graduate to the real builder.

### Q12 — badge render location
Answer: "a." Decision: rail card only (board-cell marker deferred as optional).

### Q13 — filter/group home
Answer: "a." Decision: filter icon on all AE–AI; AG defaults grouped; group-by
coexists with slot-selection; one global Ideal across groups.

### Q14 — dual selection
Answer: "a." Decision: slot-selection and volunteer-selection coexist (orthogonal).

### Q15 — cycle-count semantics
Answer: "yes." Decision: count this cycle only, pending+confirmed, exclude
declined/cancelled.

## Pruned Questions

- Q2 — one list, multi-slot day. Removed: Q1 made the slot the selection unit, so a
  selected context is always a single slot; the no-selection state shows general
  status only. Per-slot chips no longer core.
