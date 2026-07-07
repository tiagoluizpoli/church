# Handoff: 018-churchwide-ux-redesign — Phase 7 + Phase 9 (T051–T067 done, T068 remaining)

**Written**: 2026-07-07, stopped because the 5h Claude usage window hit 96% (threshold: stop at ≥95%).
**Branch**: `018-churchwide-ux-redesign` (all work below is uncommitted in the working tree — nothing was committed this session, per "only commit when explicitly asked").

## What this session did

Continued `/speckit-implement` on `specs/018-churchwide-ux-redesign/tasks.md`, picking up right after Phase 8 (which a prior session had already finished). Completed:

- **Phase 7 (Polish & Cross-Cutting)**: T051–T055, all `[x]` in tasks.md with detailed notes inline.
- **Phase 9 (Hardening)**: T064–T067, all `[x]` in tasks.md with detailed notes inline.
- **T068 is the only task left in the entire spec.** Once it's done, this feature is fully implemented.

Read `specs/018-churchwide-ux-redesign/tasks.md` T051–T067 for the full reasoning trail (each task has a completion note explaining what was checked/found). Highlights below are just the parts a fresh session needs to *act* on, not re-derive.

## Do this next: T068

```
- [ ] T068 [P9] Run `/impeccable harden` against the rendered `/scheduling/planning-cycles`,
  `/scheduling/tailoring`, and `/scheduling/builder-events` screens once T059-T063 are
  implemented and green — a targeted hardening pass (error/loading/empty states, focus
  management across the new route transitions), sequenced *after* implementation per this
  spec's own established precedent (research.md R5).
```

T059–T063 (Phase 8, the routes themselves) were already done in an earlier session — confirmed still green this session (T051/T054 full-suite reruns). So the precondition for T068 is already satisfied; just run it.

**How to run it**: invoke the `impeccable` skill (`Skill` tool, skill name `impeccable`, args something like `harden /scheduling/planning-cycles /scheduling/tailoring /scheduling/builder-events`). It's a live-browser design/UX hardening pass — read the skill's own instructions when you load it rather than assuming a fixed shape from this note.

**Dev server**: this session started one in the background via:
```
nohup bun run dev > <scratchpad>/dev-server.log 2>&1 & disown
```
Check `ps aux | grep -E "vite|turbo dev"` — if it's still alive, reuse it (web on :4001, server on :4000). If not, restart with `bun run dev` from repo root and wait ~8s for both to come up before driving a browser at it.

**After T068**: run the full regression one more time (same commands as T054, they're cheap to repeat):
```
bun run test                        # vitest, all workspace packages
cd apps/web && bunx playwright test # full e2e suite
bunx biome check .                  # repo-wide; expect only pre-existing errors under .github/skills/impeccable/scripts/**
```
Then mark T068 `[x]` in tasks.md with a completion note (same style as T051–T067), and the feature is done — no more open tasks in `tasks.md`.

## Things worth knowing before you touch anything

1. **A real a11y bug was found and fixed this session** (T067), in `apps/web/src/components/app-shell.tsx`'s breadcrumb: TanStack Router's `Link` does prefix-match active-detection by default, which was making *both* ancestor breadcrumb links claim `aria-current="page"` simultaneously on any route with a hidden trailing opaque-id segment (e.g. `/scheduling/planning-cycles/:cycleId`). Fixed with `activeOptions={{ exact: true }}` on that one `Link`. Don't revert this if you see it — it's intentional, covered by `apps/web/tests/scheduling/a11y-planning-nav.spec.ts` (new this session).

2. **Known pre-existing flake, not a regression**: `apps/web/tests/scheduling/us2-leader-tailor.spec.ts` fails when run as part of the full suite (`builderDataResponse.ok()` false) but passes every time in isolation. This has now been reconfirmed 3 times across T051/T054/T063 (a prior session). It's a same-worker DB-load issue, not code. Don't chase it.

3. **Known pre-existing skip**: `us3-volunteer-availability.spec.ts:374`, skipped since T001 (baseline, before this feature started).

4. **`bunx biome check .` repo-wide will report ~195 errors** — all of them confined to `.github/skills/impeccable/scripts/**`, an unrelated tooling directory, not this feature's code. Confirmed via `grep -v` filtering in T054. Don't try to fix those; they're out of scope.

5. **Nothing is committed.** Every file listed below is a working-tree change. Before ending your session, either commit it yourself (if the user has asked for that) or hand off again clearly stating it's still uncommitted — don't let it sit silently.

## Files changed this session (uncommitted)

New:
- `apps/web/tests/scheduling/planning-cross-tenant-isolation.spec.ts` (T064)
- `apps/web/tests/scheduling/planning-role-guard-matrix.spec.ts` (T065)
- `apps/web/tests/scheduling/a11y-planning-nav.spec.ts` (T067)

Modified:
- `apps/web/src/components/app-shell.tsx` (T067's a11y fix — `activeOptions={{ exact: true }}`)
- `specs/018-churchwide-ux-redesign/tasks.md` (T051–T067 marked `[x]` with notes)

Everything else in `git status` predates this session (Phase 8 work from an earlier session, still uncommitted from that point too).

## Usage-check protocol this session followed (continue it for T068)

Per the user's instruction: after finishing each task, ran `claude -p "/usage"` and checked "Current session: N% used". Progression this session: 87% → 88% → 89% → 90% → 91% → 93% → 93% → 96% (stopped here, after T067). Budget is tight — T068 (`/impeccable harden`, a live-browser multi-screen pass) is likely to be the most expensive single remaining task, so a fresh session/context window is the right call rather than squeezing it into an already-96%-used window.
