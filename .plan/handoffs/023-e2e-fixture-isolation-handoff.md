# Handoff: 023 — E2E fixture isolation (us4) + open decisions

Date: 2026-07-22
Branch: `023-event-builder`
Repo: `/home/tiago/01-dev-env/personal-repos/church/church`
Status: **Phases 1–6 complete and green. E2E at 54 passed / 1 failed.**
The one failure is `us4-roster-publish`, and it is a *fixture* problem, not a
product bug. That is this handoff's job.

---

## 0. Do this before your first command

**Read these, in this order, before touching anything.** Skipping them is how
the previous session wasted time reinventing commands that already existed:

1. `agents.local.md` — coding rules, the safeguard loop, and the new
   **"Running Anything In This Repo"** table (how to run/test/generate).
2. `CONTEXT.md` — domain language.
3. `.specify/memory/constitution.md` — non-negotiable governance.
4. `.plan/handoffs/qualification-and-multi-team-model.md` — the ten locked
   design decisions. Do not relitigate them.
5. `.plan/handoffs/023-spec-drift-log.md` — items 1–36. Read at least 17–36;
   they are this lane's history and contain two retractions.
6. `.plan/handoffs/023-qualification-implementation-handoff.md` — the original
   phase plan, now fully executed.

### Pick your skills with `find-skills`

Run `/find-skills` with a description of the task before starting. For this
handoff the squad it should land on is:

- **`test-master`** (`test-e2e` redirects here) — primary. Playwright fixtures.
- **`test-cases`** — map the paths before writing: happy, permission-denied,
  edge, catastrophic.
- **`diagnose`** — the reproduce → minimise → hypothesise → fix loop. Use it on
  any red test; do **not** skip to editing assertions.
- **`impeccable`** — only if you touch UI (the frontend rule requires it).

### Use CodeGraph before grep/Read

There is a `.codegraph/` index at the repo root. `codegraph_explore` returns
verbatim, line-numbered source **plus** callers and blast radius in one call —
cheaper and more complete than a grep/read loop. Treat what it returns as
already read; do not re-open those files.

Caveat learned the hard way: **name concrete symbols, not prose.** A
natural-language question drifted twice onto unrelated symbols. When that
happens, re-query with exact names (`getScheduleBuilderData db-event-manager.ts`)
instead of falling back to grep. Plain `grep` is still right for one-line
existence checks ("does this testid appear in `apps/web/src` at all?").

---

## 1. The task

Make `apps/web/tests/scheduling/us4-roster-publish.spec.ts` pass **for the right
reason**, then run the full safeguard sweep.

The user's standing instruction, quoted so it is not lost:

> "We're not building tests to pass. We're building tests to make sure the
> application's logic is right."

So: never soften an assertion to get green. If a spec fails, the null hypothesis
is that the **app** is wrong. Only after proving the app correct may you change
the spec — and then the change must preserve the original intent.

### Why it fails (fully diagnosed — do not re-derive)

Two independent causes stacked on one spec:

**(a) Order-dependence on shared seed state.** `playwright.config.ts` sets
`workers: 1`, so files run serially in path order. `smoke.spec.ts` sorts before
`us4-roster-publish.spec.ts` and publishes the **same** seeded Worship cycle. By
the time us4 runs:

```
Error: expect(locator).toHaveText(expected) failed
Expected: "Availability requested"
Received: "Published"
  at us4-roster-publish.spec.ts:43  (participation-state-badge)
```

**(b) It drives UI that no longer exists.** `roster-page`,
`roster-completion-summary`, `assign-<requirementId>-<volunteerId>`, and
`publish-participation-button` appear in **no** source file. The per-participation
roster page was replaced by the cycle builder; publishing is now cycle-level
(`useCycleBuilder.publish` → `adminApi.publishCycle`). Confirm with
`grep -rn 'roster-page' apps/web/src` — zero hits.

What is still valuable and must survive any rewrite (these are API-level and
still correct):

- Worship participation ends `published`.
- Sibling **Care** participation stays `availability_fired` — cross-ministry
  publish isolation.
- The volunteer sees the published slice on `/dashboard?section=ministry_schedule`.

### The dead end — don't repeat it

The obvious "flip it to publish Care instead" **does not work**: the leader's
membership in `ministryCare` is `systemRole: 'volunteer'` (see `e2e-seed.ts`,
the `e2eccccc-…ccc7` membership), and `canManageMinistry` → `isMinistryLeader`
requires `systemRole = 'leader'` exactly. The leader would get 403 publishing
Care. There is also no second unpublished Worship cycle to borrow.

### Chosen approach: a dedicated US4 cycle in the seed

Add a US4-only planning cycle to `apps/server/src/test-support/e2e-seed.ts` so
us4 publishes a cycle **no other spec touches**, then rewrite the spec's middle
section to drive the real cycle builder.

Shape it needs:

- A new `planningCycle` row (new id, e.g. `e2e21111-…-2222`), locked, in
  `E2E_IDS.church`.
- One Worship event + `timeSlot` + `shift` + `slotRequirement`s, and one Care
  event on the same cycle so the sibling-isolation assertion still has a
  subject.
- Both participations seeded at `availability_fired` (mirror how the existing
  `E2E_IDS.planningCycle` participations are seeded — copy that block, don't
  invent new state transitions).
- Export the new ids from `E2E_IDS` so the spec references them by name.

Then in the spec, replace the dead middle section with the builder flow that
`smoke.spec.ts` already proves works:

```ts
await page.goto(`/scheduling/rostering/${MINISTRY_ID}/${US4_CYCLE_ID}`);
await page.getByRole('button', { name: /^Show only .*\b<day>\b/i }).click();
await requirement.getByRole('button', { name: 'Add' }).first().click();
await page.getByTestId('assignment-picker').getByTestId('picker-option').first().click();
await expect(requirement.getByTestId('assignment-chip')).toBeVisible();
await page.getByRole('button', { name: 'Publish cycle' }).first().click();
await page.getByRole('button', { name: 'Publish cycle' }).last().click();
await expect(page.getByText('Cycle published')).toBeVisible();
```

Keep the existing API assertions and the volunteer-dashboard block unchanged.

**Risk to watch:** adding a cycle adds rows to every cycle-list view. Specs in
`planning-cycles-table-view.spec.ts` and `tailoring` already tolerate extra
cycles (they create their own), but run the **full** E2E suite afterwards, not
just us4 — a green us4 with two new reds is a regression.

### Then: the systemic fix (recommended, larger)

The above fixes one spec. The *class* of bug is that every spec shares one
globally-seeded database (`globalSetup` runs `seedE2e` once). Two specs already
tripped on it this session. The durable fix is re-seeding between spec files, or
giving each mutating spec its own cycle by convention.

Drift-log item 34 states the rule worth enforcing either way:

> Any spec selecting by `.first()` from a list other specs can append to is
> order-dependent by construction.

Do not attempt the systemic fix in the same change as the us4 fix. Land us4
green first, full sweep green, then propose the isolation refactor separately.

---

## 2. Two open product decisions — ask, do not guess

Neither is yours to settle unilaterally. Both are recorded in the drift log.

### (a) Sub-leaders are 403'd from the cycle builder — drift item 22

`GET /cycles/:cycleId/builder` guards on `canManageMinistry` →
`isMinistryLeader`, which matches `systemRole = 'leader'` exactly. A sub-leader
gets 403 and the page never renders.

This contradicts the rest of the 023 model: `DbEventManager.getScheduleBuilderData`
**admits** sub-leaders and narrows them to the teams they lead, and the e2e seed
exists partly to resolve one "as a sub_leader of team1".

Captured as a `test.fail()` in
`apps/web/tests/scheduling/qualification.spec.ts` — deliberately still executing.
The day the guard admits sub-leaders, Playwright reports an **unexpected pass**
and the annotation must be removed. Do not delete that test to tidy the suite.

### (b) Was the `/scheduling` ad-hoc create-event entry point meant to go?

`/scheduling/index.tsx` is now a bare redirect to `/scheduling/planning-cycles`
(the FR-015/016 nav restructure). `single-create-event-ui.spec.ts` was rewritten
to assert the redirect plus the single canonical "Add event" form, on the
reading that FR-012 ("exactly one create-event UI") is now satisfied *because*
there is only one surface. If product intended a ministry ad-hoc create path to
survive, that spec is now guarding the wrong thing.

---

## 3. State of the branch

**Nothing is committed.** All six phases plus the E2E work are uncommitted. Do
not revert unrelated files. There is also pre-existing throwaway prototype work
in `apps/web/src/features/scheduling/components/cycle-board-prototype/` — leave
it alone and keep it out of any commit for this feature.

Last full sweep, from the repo root:

| Gate | Result |
| --- | --- |
| `bun run check` | clean, 689 files |
| `bun run check-types` | 4/4 tasks |
| `bun run test` | 5/5 tasks — server 728, web 433, db 44, auth 4 |
| `bun run test:e2e` | 54 passed / 1 failed (`us4`) |

`web#test` flaked once under turbo and passed standalone and on re-run. Re-run
before believing it.

### Known dead code to clean up (drift item 31)

`apps/web/src/features/scheduling/components/builder/staffing-meter.tsx` —
`StaffingMeter` is exported but rendered nowhere; the board redesign replaced it
with a per-date readout (`cycle-date-staffing-percent`). Delete once the
redesign settles.

---

## 4. Definition of done

1. `us4-roster-publish` green because the flow it describes genuinely works.
2. Full `bun run test:e2e` green except the one intentional `test.fail()`.
3. `bun run check`, `bun run check-types`, `bun run test` all green from root.
4. Every divergence appended to `.plan/handoffs/023-spec-drift-log.md`
   (continue numbering from 36). Do **not** edit anything under
   `specs/023-event-builder` — the spec is amended at the end, from what was
   actually built.
5. No Spec Kit. No `speckit-*` skills in this lane.
6. Conventional Commits. **No `Co-Authored-By` trailer.**
7. Stop for user review at the end; surface the two open decisions above.
