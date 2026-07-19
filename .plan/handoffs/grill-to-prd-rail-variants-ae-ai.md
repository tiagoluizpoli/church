# Handoff: Grilling To PRD

Date: 2026-07-19
Source Session: .plan/grilling/2026-07-17-rail-variants-ae-ai.md
Status: ready-for-prd
Scope: Five new throwaway prototype rail variants (AE–AI) turning the volunteer
list into a slot-driven, bidirectional navigation helper, in
apps/web/src/features/scheduling/components/cycle-board-prototype. Prototype only
(mock data, no backend). Keep A–AD.

## Stable Decisions

- Append AE–AI; keep A–AD; stay throwaway/mock; register in RAIL_VARIANTS.
- Each variant bundles: ⋮⋮ drag handle · avatar (shadcn Avatar, initials
  fallback, no photos) · "last served N weeks ago" human recency · compact
  cycle-assignment count · availability · one "Ideal" badge.
- "Ideal" badge: label "Ideal" (invariant EN/PT-BR), star/sparkle icon, primary
  color; replaces the incoherent flame/"Coldest". At most one per rail context;
  rank available → longest-since-served → lowest cycle load → name; shown ONLY
  when a slot context exists. ≈ real builder recommendations().safe[0].
- Rail = bidirectional helper:
  - Selection unit = a slot cell = the requirement/shift box (date+slot+role).
    Clicking the box BACKGROUND selects it → rail recomputes for that slot. The
    inner `+ Add` pill and assigned-volunteer pills stay the direct assign/interact
    controls; the box remains a drop target.
  - Reverse: selecting a VOLUNTEER highlights every board cell they fit — strong
    for available+eligible, faint for eligible-but-unavailable.
  - Slot-selection and volunteer-selection COEXIST (orthogonal axes).
  - No selection → general fairness/availability list; no "Ideal" badge.
- Composition precedence (all stack): search → group-by-role → selected-slot
  availability/order → badge within the visible/eligible set.
- Unavailable/conflict volunteers: keep visible but dimmed + marked, still
  draggable (override path), never "Ideal".
- Cycle-count: this cycle only, statuses pending+confirmed, exclude
  declined/cancelled.
- Filter/group control: filter icon on ALL AE–AI; options show-all vs
  group-by-role (extensible); AG defaults grouped; one global Ideal across groups.
- Five archetypes (structurally distinct, not tweaks):
  - AE rich row · AF avatar card · AG grouped-by-role · AH availability-split
    (available-for-selected-slot vs not) · AI compact leader-focus.
- Mock-data shape mirrors the real per-shift eligibleVolunteers (isAvailable,
  hasConflict, lastServedAt, workload) + adds volunteer roles[]; fabricate
  per-slot availability so selecting a slot changes the list.
- Badge renders in the rail card only (board-cell marker deferred/optional).
- All four new behaviors (Ideal badge, slot-select-drives-rail, reverse highlight,
  group-by-role) are intended to GRADUATE to the real builder; the prototype only
  chooses the visual.

## Open Tensions

- "Cell = requirement box, background-click selects" is assumed from the user's
  verbal description; a promised screenshot did not arrive. Confirm the click
  target (per-role requirement box vs whole shift group) before wiring select.
- Select-vs-assign coexistence on the same box needs a clean hit-test (background
  = select; pills/drag = assign) so a mis-click doesn't assign.
- Per-slot availability chips were pruned as non-core; may return as an optional
  nicety in the default (no-selection) state — do not block on them.
- Reverse highlight (person→cells) and drag two-tier highlight share visual
  language; keep them consistent, not competing, when both could be active.

## PRD Expectations

- Preserve the bidirectional-helper model as the spine; the 5 variants are only
  layout expressions of the same behavior + data.
- Keep it throwaway: PROTOTYPE ONLY markers, no prod imports, no backend/real-
  builder edits; register AE–AI without removing A–AD.
- Keep the shared DnD harness, ghost card, and two-tier drop highlight intact.
- Verification: biome + tsc clean; vitest unit+component green; drive the live
  prototype route (192.168.0.200:4001, not localhost) — screenshot AE–AI, a
  slot-select recompute, a volunteer-select reverse highlight, and a drag.
- Map-back note: name the seams (recommendations().safe[0] for Ideal; onFocus for
  slot-select; eligibleVolunteers for availability) so the winner ports cleanly.

## Badge Label Shortlist ("Ideal" and alternatives)

Chosen: "Ideal" (Star icon) — identical word EN/PT-BR, invariant (no gender
agreement), short. i18n-safe alternatives if reconsidered: "Destaque"
(Featured/Spotlight, Bookmark/Sun), "Na vez"/"É a vez" (their turn, Clock,
fairness angle), "Melhor opção"/"Melhor escolha" (Sparkles/Star). AVOID gendered
adjectives that need PT agreement: Recomendado(a), Descansado(a), Pronto(a).

## Current Prototype State (start here on a new machine)

Branch: 023-event-builder. Prototype is BUILT and committed; AE–AI are NOT built
yet — this handoff is the spec for them.

Built so far (route /scheduling/rostering/prototype?variant=A..AD):
- 30 rail variants A..AD, flipped via ?variant= and a floating switcher
  (hidden in prod), on a board restyled to match the REAL builder (date columns,
  requirement cells, green/yellow/red staffing strip).
- Shared @dnd-kit harness: pointer + keyboard sensors (a11y), DragOverlay ghost
  card, two-tier drop highlight (every empty cell droppable; recommended stronger).

Files (apps/web/src/features/scheduling/components/cycle-board-prototype/):
- cycle-board.tsx — board host + DndContext + switcher + variant rail (real-look).
- rail-variants.tsx — the 30 variants + registry (RAIL_VARIANTS) + shared bits
  (RailFrame, DragBox, InitialsCircle, LoadMeter, StatusPill, ghosts, CardList,
  FilterChips, useAvailabilityFilter). APPEND AE..AI here; keep A..AD.
- prototype-dnd.tsx — useVolunteerDraggable + DroppableRole (two-tier cell).
- prototype-data.ts — mock data (extend per Mock-data decision above).
- prototype-switcher.tsx — floating variant bar.
- route: apps/web/src/routes/scheduling/rostering/prototype.tsx (validateSearch variant).

Real-builder seams to mirror/port back:
- Availability + "Ideal": features/scheduling/components/builder/cycle-builder-matrix.tsx
  → recommendations()/candidates()/pool(); eligibleVolunteers carry isAvailable,
  hasConflict, lastServedAt; workload computed from data.assignments.
- Slot-select→rail: real cells call onFocus → setFocused(ids); sidebar consumes
  focusedVolunteerIds/focusLabel (volunteer-pool-sidebar.tsx).

Pending input: a screenshot of the "red-squared cell" to confirm the select
target (per-role requirement box vs whole shift group). Assume per-role box until
confirmed.

Run / verify (repo rules: agents.local.md — shadcn-only, single-object params,
named types, NO linter suppression; commits: Conventional Commits, NO
Co-Authored-By):
- Dev app (no watch): http://192.168.0.200:4001 (NOT localhost — CORS). Login
  admin@local-dev.test / dev-password-123. Ministry Local Ops
  124d5981-af5e-4d4a-b34d-9ac062c9af99, cycle Janeiro
  30a40378-aa44-47b3-8abd-8ceb9637e0ae.
- From apps/web: `bunx biome check src/`, `bunx tsc --noEmit -p tsconfig.json`,
  `bunx vitest run --project unit --project component`.
- WIP caveat: the wider 023 tree (backend slices + builder rebuild + date-key fix)
  was committed for transport but NOT fully re-verified this session; prototype
  files ARE biome/tsc clean and browser-verified.

## Next Step (Spec Kit — this repo uses .specify / specs/*)

- Do NOT use luna-to-prd. Feed this handoff into Spec Kit:
  1. `speckit-specify` — feature description = the Stable Decisions + archetypes
     above (volunteer-rail AE–AI availability-aware helper).
  2. `speckit-plan` → `speckit-tasks` → `speckit-implement`.
- Keep it a throwaway prototype pass (mock data, no backend), then decide which
  single variant graduates into the real builder.
