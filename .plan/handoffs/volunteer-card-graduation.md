# Handoff: Graduate the AE Volunteer Card into the Real Builder

Date: 2026-07-22
Branch: 023-event-builder
Status: design finished + prototype built; ready to port
Scope: Port the winning prototype rail card (variant **AE**) into the real cycle
builder sidebar, plus a new group-by-status option.

## Outcome of the prototype phase

Variant **AE** won. User: "This is the perfect card ever, and I'm talking about
the AE." The prototype's job is done — it exists only to pin the visual and the
interaction. Everything below is the spec to reproduce in real code.

Prototype lives in
`apps/web/src/features/scheduling/components/cycle-board-prototype/`
(throwaway, mock data, do NOT import into prod). Route:
`/scheduling/rostering/prototype?variant=AE`.

## The AE card spec (reproduce exactly)

Rail width: **380px** (`cycle-board.tsx`, grid
`xl:grid-cols-[minmax(0,1fr)_380px]`). Was 320px, widened deliberately.

Card is `p-3`, `rounded-lg border`, and **three stretched columns**. Every one of
the four corners sits on the same 12px padding box — the user is explicit about
symmetry, this was iterated on hard:

```
┌──────────────────────────────────────────────┐
│ [avatar]  Carla Mendes        [Ideal]  Confirmed │  ← status flush to top padding
│           Check-in · Slides                      │  ← roles line (truncates)
│           🕐 last served 5 weeks ago             │  ← clock on FIRST line only
│ [⋮⋮]         0 this cycle          Select slot   │  ← all three on the bottom line
└──────────────────────────────────────────────┘
```

- **Left column** — avatar top, drag grip bottom (`flex-col justify-between`,
  `items-start`).
- **Middle column** — name (+ Ideal badge inline), roles line, recency block.
  Must be `flex flex-col` and stretch, so recency can bottom-anchor.
- **Right column** — status top, Select-slot button bottom
  (`flex-col justify-between items-end`).

### Interaction rules (these were the whole point)

1. **The grip `⋮⋮` is the ONLY drag affordance.** The card body is inert — it is
   not draggable and not clickable. Attach the draggable ref/listeners/attributes
   to the grip button alone.
2. **Selection happens only via the "Select slot" button**, and it **toggles** —
   clicking it again deselects. This was the user's core complaint about the
   first attempt: "there is no way for us to deactivate it and that's bad."
   Implement as `setSelected(prev => prev === id ? null : id)`.
3. Selecting a volunteer highlights every board cell they fit (reverse
   highlight): strong for available+eligible, faint for eligible-but-unavailable.
4. Keep the drag ghost / DragOverlay and the two-tier drop highlight.

### Typography / layout details that were iterated on

- **Recency is always two lines**, never side-by-side: "last served 5 weeks ago"
  and "0 this cycle" are two separate facts. Use `flex-col`, not `flex-wrap` —
  wrapping produced inconsistent gaps the user rejected.
- **Clock icon aligns to the first line only** (`items-start` + `mt-0.5`), never
  vertically centred across both lines.
- Recency block uses `mt-auto pt-1.5` so it bottom-anchors and lines up with the
  grip and the Select-slot button.
- **Roles line truncates with a tooltip that appears ONLY when actually
  clipped.** Measured, not guessed: a hook comparing
  `scrollWidth > clientWidth` plus a `ResizeObserver`, wrapping in shadcn
  `Tooltip` only when true. Rationale the user gave: the card is no longer
  clickable, so hover is how a leader inspects roles without leaving the page.
- **Optical alignment of the Select-slot button**: it is a `Button` with its own
  `px-2`/height, sitting next to padding-less text. Needs `-mr-2 -mb-1` to make
  its *label* share the right edge and the bottom text line. Without this it
  visibly floats up and in.
- Select-slot button stays **small** (`h-6 px-2 text-[11px]`, ghost / secondary
  when selected). An earlier `h-8` version was rejected as "huge".
- Status ("Confirmed") is a plain span, flush to the top padding — no nudge.

## Where it lands in real code

| Prototype piece | Real target |
|---|---|
| `RailRow` / card markup | `apps/web/src/features/scheduling/components/builder/volunteer-card.tsx` |
| Rail frame, search, filters | `.../builder/volunteer-pool-sidebar.tsx` |
| Ordering + filtering logic | `apps/web/src/features/scheduling/hooks/use-volunteer-pool.ts` |
| `selectedSlot` → rail recompute | `cycle-builder-matrix.tsx` `onFocus` → `setFocused(ids)`; sidebar already consumes `focusedVolunteerIds` / `focusLabel` |
| Ideal badge | `cycle-builder-matrix.tsx` `recommendations().safe[0]` — ranking already exists |

Note the real `VolunteerCard` **already has** a "Select slot" button and status /
`Serving (N)` badges. It is a starting point, not a blank slate.

## Data availability (verified — do not re-investigate)

| Card element | Status |
|---|---|
| Name, availability status | ✅ `PoolVolunteer` |
| Ideal ranking | ✅ `recommendations().safe[0]`; server `sortEligibleVolunteers` ranks available → longest-since-served → name |
| Grip drag, Select-slot toggle | ✅ pure UI |
| **"last served N weeks ago"** | ⚠️ **already on the wire** — `CycleBuilderEligibleVolunteerSummary.lastServedAt` is used at `cycle-builder-matrix.tsx:213`. `pool()` (line 120) simply **drops it** when building `PoolVolunteer`. Just thread it through → `PoolVolunteer` → `VolunteerPoolItem`. No server work. |
| **"N this cycle"** | ⚠️ `workloadCount` already counts cycle-wide `data.assignments`. The number is right; only the existing tooltip wording says "this event". Relabel, don't rebuild. |
| **Roles line** | ❌ **BLOCKED** — no volunteer→role data exists anywhere. See `qualification-and-multi-team-model.md`. |

## Work breakdown

**Unblocked now (web only):**
1. Thread `lastServedAt` through `pool()` → `PoolVolunteer` → `VolunteerPoolItem`,
   render as "last served N weeks ago".
2. Port the AE card into `VolunteerCard` per the spec above.
3. Add **group-by-status** to the sidebar. Decided grouping:
   **Ready** (available) / **Awaiting** (no_response + partial) / **Unavailable
   collapsed** behind an expandable "Unavailable (N)" section — still draggable
   as the override path.
4. Relabel the workload tooltip to cycle scope.

**Blocked on qualification:**
5. The roles line + its truncation tooltip. Ship the card without that line, add
   it when `ministry_volunteer_role` exists.

## Rules

`agents.local.md` applies in full (real code, unlike the prototype):

- shadcn components only; Bulletproof React structure; unidirectional imports
  (`shared` → `features` → `app`).
- Single-object parameters; named `interface`/`type` for every object shape; no
  inline object typing in touched files.
- No linter/compiler suppression directives without explicit permission.
- Phase gate after each phase: `bun run check`, `bun run check-types`,
  `bun run test`, `bun run test:e2e`, then code review of modified files.
- Commits: Conventional Commits, **no Co-Authored-By trailer**.

## Environment

- Dev app: `http://192.168.0.200:4001` (**not** localhost — CORS).
- Login `admin@local-dev.test` / `dev-password-123`.
- Ministry Local Ops `124d5981-af5e-4d4a-b34d-9ac062c9af99`,
  cycle Janeiro `30a40378-aa44-47b3-8abd-8ceb9637e0ae`.
- The Playwright MCP browser profile is often held by the user's own session; if
  it reports "Browser is already in use", ask before killing it.

## Prototype disposal

Once AE is live in the real builder, delete
`apps/web/src/features/scheduling/components/cycle-board-prototype/` and the
`/scheduling/rostering/prototype` route. It was always throwaway.
