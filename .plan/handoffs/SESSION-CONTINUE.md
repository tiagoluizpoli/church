# Session handoff — 023 cycle-builder rail (2026-07-23)

Continue from here. **Everything is UNCOMMITTED** in the working tree on branch
`023-event-builder`. Nothing has been committed or pushed. Do not reset/checkout.

## Read first
- `.plan/handoffs/023-builder-critique-backlog.md` — **design backlog, now
  CLOSED (B-1…B-9 all done, score 19 → 26 → 29/40, zero P0/P1)**. If this
  session was opened to work on builder/rail design, that backlog is the
  place to check first for context, but there's nothing left to pick up from
  it — re-run `/impeccable critique` if the surface has changed since.
- `.plan/handoffs/volunteer-card-graduation-progress.md` — the running log.
  Sections **§5b–§5f** are this session's work (all uncommitted).
- `agents.local.md` — **command vocabulary changed mid-lane.** Use
  `bun run validate:affected` (per-phase gate) + `bun run test:e2e -- tests/[path]`
  for the story spec, then `/code-review`. `bun run check` / `check-types` NO
  LONGER EXIST → they are `lint:fix` / `typecheck`; `bun run test` is now the
  whole suite. `validate` is the final/merge gate.
- Memory: `feedback_react_query_standard` — user expects optimistic updates +
  background refresh as a default for mutations (see "not done yet" below).

## What shipped this session (all uncommitted, all gated green)
1. **Phase 3** slot focus + slot-aware ranking (rail promotes best candidates).
2. **Phase 4** reverse highlight (`volunteerFitForShiftRole` → ready/override/none tiers).
3. **Phase 5** prototype deleted (`cycle-board-prototype/` + 2 routes, 4.7k lines).
4. **Principal review fixes (§5b):** FR-016 override now a discriminated
   `ShiftRoleFit` union carrying `conflictType` (board + drag both forward it);
   FR-011 fallback deleted; FR-017 `isActiveAssignment` allowlist.
5. **"Pick me" from the rail (§5c):** focus a shift×role → every card (whole
   pool minus this-shift's assignees) shows **Pick me**, commits via the board's
   own `onSelectAssignment` path (override/collision dialogs still fire).
   `data-testid="volunteer-pick-me"`.
6. **Drag/grip/padding (§5d):** DragOverlay portal (ghost no longer clipped by
   the rail ScrollArea); 2×2 `SquareGripIcon`; card corners re-measured live to a
   uniform 13px (`-mb-1` → `-mb-1.5`).
7. **Role-filter bug + chip (§5e):** filter now qualification-based; removable
   filter chip.

8. **Optimistic assignment mutations (§5f, 2026-07-24):** create/delete/reassign
   all write the cache in `onMutate`, roll back in `onError`, reconcile in
   `onSettled`; the reconcile no longer blocks `mutateAsync`. New pure module
   `use-cycle-builder.optimistic.ts` + 12 tests.

9. **`crypto.randomUUID is not a function` on assign (fixed 2026-07-24).**
   Reported live on the LAN dev host. `crypto.randomUUID` is **secure-context
   only**, so over plain HTTP anywhere but `localhost` it is `undefined` — and
   `createOptimisticAssignmentId()` calls it on *every* assignment, so every
   write threw before it left the client. Localhost, jsdom and the E2E run are
   all secure contexts, which is why nothing caught it. New
   `src/shared/utils/id.ts` → `randomId()`: `crypto.randomUUID()` when it
   exists, else a v4 UUID built from `crypto.getRandomValues` (not
   secure-context gated), else `Math.random`. Both call sites use it
   (`use-cycle-builder.optimistic.ts`, `cycle-builder.tsx`'s `failedWriteId`).
   4 unit tests, one per branch. **Verify in the browser at
   `http://192.168.0.200:4001` — the bug is invisible from localhost.**

## Still open / not done (pick up here)
- **Optimistic-id guard** (small, optional): during the optimistic window a row
  carries `optimistic:<uuid>`; removing/dragging it in that window 404s, toasts,
  and self-heals on the refetch. `isOptimisticAssignmentId` is exported for a
  guard in `cycle-builder.tsx` if it ever bites.
- **Loading spinner** on the assignment mutations — deprioritized by the user;
  the optimistic write covers the feedback gap.
- **FR-016 pre-existing gap** (surfaced by review, NOT from this work): the
  collision "Move/Swap" branch in `cycle-builder.tsx` `applyCollision` assigns
  with no `overrideReason` → a volunteer who is BOTH assigned-elsewhere AND a
  conflict skips the reason. Equally reachable from the board. Ticket it.
- ~~**Unqualified Pick me under hard enforcement**~~ — **closed for real,
  2026-07-25.** Reopened earlier the same day when a re-critique found the
  2026-07-24 "done" claim false against source (`isAssignableFit()` still
  hard-excluded `'unqualified'`). Fixed properly this time: `isAssignableFit()`
  now accepts any tier but `none`, so every gesture — Pick me included — can
  offer an unqualified candidate, which routes to `OverrideDialog`'s
  `not_qualified` variant with `conflictType: 'not_qualified'`, same as any
  other override. `validate:affected` genuinely green (218 web tests, 301
  server integration tests). See B-2's status block in
  `023-builder-critique-backlog.md` for the full diff list.
- **Ghost button-box overshoot** (cosmetic): grip/action ghost boxes overshoot
  the 13px line for hit-area; glyphs are on-grid. Only fix if a hover highlight
  looks off.
- **Commit split** never done: Phases 1–5, the review fixes, Pick-me, the
  drag/grip/padding polish, the filter fix, the optimistic mutations, and the
  `tooling/validation/affected.ts` deleted-path fix. Suggested: one commit per
  logical unit; **no `Co-Authored-By` trailer** (user's standing rule).

## Dev app (for live measurement)
`http://192.168.0.200:4001` (NOT localhost — CORS). Login
`admin@local-dev.test` / `dev-password-123`; on the login page click "Already
have an account? Sign In" first. Ministry `325de49a-…` (Local Ops), cycle
`7c6481bc-…` (Julho 2026) — reseeds change these; navigate Rostering → View
cycles. Builder route:
`/scheduling/rostering/325de49a-bf67-48c5-946b-4296e57dcd55/7c6481bc-51c4-4499-9822-405cab089eb0`.
This card is measured with `getBoundingClientRect`, never eyeballed.
