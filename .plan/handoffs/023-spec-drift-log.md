# 023 Spec Drift Log — qualification + multi-team

Running list of divergences between the implementation and
`specs/023-event-builder`. **Do not edit the spec while implementing.** When the
assigning page reaches the target state, review this list and add targeted
amendments on top of the existing 023 spec files — only where necessary.

## Phase 1 — schema

1. **`ministry_volunteer.team_id` not dropped in the same migration as the new
   tables.** Handoff decision 2 says "backfill from the existing
   `ministry_volunteer.teamId`, then drop the column". Dropping it in migration
   0010 would break every reader (the `MinistryVolunteer` entity, the volunteer
   repository contract, volunteer DTOs, both seed files) and fail the phase-1
   `bun run check-types` gate. The column drops in **phase 2**, together with the
   readers that move to `ministry_volunteer_team`. Same end state, one phase later.

2. **No data backfill from `ministry_volunteer.team_id`.** Confirmed with the
   user: migration 0010 stays purely drizzle-kit-generated DDL. Team memberships
   come from the seed files (phase 5), consistent with decision 4 (no production
   data exists).

3. **`ministry_volunteer_team` carries `id`, `church_id` and `created_at`.** The
   handoff sketched it as `(membershipId, teamId)`. The extra columns match every
   other table in `packages/db/src/schema/core.ts` and satisfy the strict
   `church_id` multi-tenant isolation rule in `agents.local.md`.

## Phase 2 — domain + repositories

4. **`hasRoleQualification` was a second no-op, not just `listQualifiedForRole`.**
   It returned true whenever the volunteer was an active member of the ministry
   owning the role. The design handoff only flagged `listQualifiedForRole`. Both
   are now backed by `ministry_volunteer_role`.

5. **`MinistryMembership` gained `qualifiedRoleIds` in phase 2, not phase 4.**
   Teams and qualified roles come from the same membership scope, so one query
   serves both. Phase 4 still has to surface them on
   `ScheduleBuilderVolunteerOption`.

6. **`callerTeamId` renamed to `callerTeamIds: string[] | null` across the API.**
   A sub-leader may now lead several teams, so the single-team payload field was
   no longer expressible. This touches the generated
   `apps/web/src/infrastructure/api/churchAPI.schemas.ts`, hand-edited for now
   and due to be regenerated in phase 4.

7. **Coverage counting for team-less requirements changed.** In
   `db-volunteer-manager.getMinistrySchedule`, a requirement with no team
   previously counted only volunteers whose single team was null. It now counts
   any member. This is the correct composition rule per decision 1 ("qualified
   for the role AND — only when the requirement names a team — a member of that
   team"), but it is a behaviour change worth a spec note.

8. **`MinistryVolunteer.assignTeam` / `removeTeam` deleted.** Both had zero
   callers and could not survive the column drop. The entity is only ever
   constructed in tests.

## Phase 3 — qualification enforcement

9. **`AssignmentManagerService.publish` has no production caller to supply.**
   The handoff requested replacing its empty qualification supplier, but the
   service is only invoked by domain tests: current application code uses
   `generateSlots`, while planning-cycle publication bypasses this service.
   The live 023 builder path is `DbAssignmentManager`, which now obtains the
   scoped qualification through `VolunteerRepository.hasRoleQualification`.
   No unreachable application path was introduced solely to feed a supplier.

## Phase 4 — API payload

10. **`teamIds` is narrowed to the caller's own teams, not the member's full
    set.** `ScheduleBuilderVolunteerOption.teamIds` passes through the
    sub-leader's team filter in `db-event-manager.getScheduleBuilderData`. A
    sub-leader already only sees members sharing one of their teams, but those
    members may also belong to teams the sub-leader does not lead. Emitting the
    raw membership set would put out-of-scope team ids in the payload — new
    information the pre-phase-4 response never carried. Leaders are unfiltered.
    `qualifiedRoleIds` is *not* narrowed: roles are ministry-scoped, so there is
    no caller scope to intersect against.

11. **The phase-2 `callerTeamIds` hand edit was reproduced exactly by the
    generator.** Regenerating `churchAPI.schemas.ts` changed only
    `GetScheduleBuilderData200VolunteersItem` (the two new arrays) and picked up
    `NOT_QUALIFIED` from phase 3, which had never reached the client. Drift
    item 6 is now closed: the spec was the stale side, not the client.

12. **The OpenAPI export had no package script.** `apps/server/auto-generated-api.yaml`
    is orval's input but nothing regenerated it — the script could only be run
    by bare path, and doing so from the repo root silently picks up the root
    `tsconfig.json`, which lacks `emitDecoratorMetadata`, making tsyringe fail
    to resolve controllers. Added `server#export:openapi` and a root
    `api:generate` (`export:openapi && orval`) so the two steps always run
    together from the correct cwd.

13. **The repository integration seed never granted a role qualification.**
    `tests/integration/repositories/setup.ts` seeded a `ministry_volunteer` row
    but no `ministry_volunteer_role` row. The two qualification contract tests
    passed only because the pre-phase-2 predicate treated membership as
    qualification; activating the real predicate exposed the gap. The contract
    spec was correct throughout — the seed was stale. This is the same class of
    gap phase 5 addresses for the dev/e2e seeds.

## Phase 5 — seeds

14. **Qualification coverage is deliberately partial in the demo seed, total in
    the e2e seed.** `volunteer.factory` grants roughly one member in seven no
    roles at all, most members one role, and a minority two or three. Qualifying
    everyone would make the builder's candidate filter unobservable — the
    candidate list would equal the roster, and a broken filter would look
    identical to a working one. `e2e-seed.ts` takes the opposite line and
    qualifies every membership for every role in its ministry: those specs
    assert availability conflicts, sub-leader scoping and the override flow, and
    a partial spread would fail them for a reason they do not test.

15. **The demo seed's assignment factory now filters candidates by
    qualification.** `generateAssignmentsAndAvailability` previously picked any
    member of the requirement's ministry. Once qualifications became real, that
    would have seeded assignments the builder itself rejects — every seeded
    cycle would open full of `NOT_QUALIFIED` warnings. It now receives the
    qualification map from `generateVolunteers` and assigns only qualified
    members. Verified: zero seeded assignments contradict a qualification.

16. **`generateVolunteers` gained a `roles` parameter and returns
    `qualifications`.** Qualification hangs off the membership, so the map is
    keyed by `ministry_volunteer.id`, not by volunteer id — a volunteer in two
    ministries has two independent entries.

## Phase 6 — web

17. **Candidate filtering needed no new work; it was already correct.** The
    handoff listed "qualification-filtered candidates per slot" as phase 6, but
    the live builder reads `shift.eligibleVolunteers`, which flows from
    `DbParticipationManager.listEligibleVolunteers` →
    `listQualifiedVolunteersForShift` → `VolunteerRepository.listQualifiedForRole`.
    Phase 2 made that predicate real, so the filter started working then. Phase 6
    only had to surface *which* roles a candidate holds.

18. **The roles line is fed from the rostering payload, not from phase 4's
    `ScheduleBuilderVolunteerOption`.** The cycle-board UI the volunteer card
    belongs to is built from `getCycleBuilderData`, a different endpoint from
    `getScheduleBuilderData`. `qualifiedRoleIds` was therefore added a second
    time, to `EligibleVolunteerView` and `eligibleVolunteerResponseSchema`.
    Phase 4's field still serves the older schedule-builder path; the two are
    not redundant, they feed different screens.

19. **`EligibleVolunteerView.qualifiedRoleIds` carries the member's whole
    ministry skill set, not the current shift's roles.** Narrowing it to the
    shift would make the same person's card read differently from one slot to
    the next. It is sourced from `listMinistryMemberships`, hoisted to one call
    per cycle in `getCycleBuilderData` (every event in a cycle shares the
    ministry), so the batched path stays free of N+1.

20. **Role ids that match no role in the cycle are dropped in the web mapper.**
    `pool()` resolves ids to names against `data.roles` and filters out misses,
    because rendering an unresolved uuid would read as a skill name.

## E2E coverage pass

21. **`cycle-builder-board` never existed.** Four specs waited on that testid;
    `git log -S` finds it in no revision of `apps/web/src`. The builder root has
    always been `cycle-builder`. Repointed — `planning-role-guards` and
    `planning-role-guard-matrix` went green immediately, which confirms these
    specs had never run, not that they regressed.

22. **Sub-leaders are locked out of the cycle builder (open question).**
    `GET /cycles/:cycleId/builder` guards on `canManageMinistry` →
    `isMinistryLeader`, which matches `systemRole = 'leader'` exactly, so a
    sub-leader gets 403. This contradicts `DbEventManager.getScheduleBuilderData`,
    which admits sub-leaders and narrows them to their own teams, and contradicts
    the e2e seed's stated purpose of resolving a "sub_leader of team1". Captured
    as a `test.fail()` spec rather than deleted: it will report an unexpected
    pass the moment the guard changes. Needs a product decision.

23. **`--destructive` fails WCAG AA as small text.** `oklch(0.614 0.207 26)`
    (#e63c3b) on the card surface measures 4.05:1 where 4.5:1 is required at
    12px, producing 163 axe violations on the builder. `oklch(0.58 ...)` reaches
    4.66:1. Not changed here: it is a global brand token and darkening it is a
    design decision, not a test fix.

24. **`ministry-cycle-assign-link-<id>` renders twice.** The card layout and the
    row layout both mount it for the same cycle, so Playwright strict mode fails
    with two matches. A testid that identifies one cycle should resolve to one
    element.

25. **Three specs target UI that does not exist.** `roster-page` appears in no
    source file; `New Event` exists only as a modal title, never as a button;
    the date-strip buttons are named "Show only sex., 25 de dez.", not
    "25 de dezembro de 2026". Like item 21, these are WIP specs that never ran.

## Safeguard sweep — fixes applied

26. **`--destructive` darkened to `oklch(0.58 0.207 26)`** (item 23). Clears all
    163 axe violations; `a11y-builder` is green. Hue and chroma unchanged, and
    destructive-as-background only gains contrast against white foreground.

27. **Publishing a cycle reported nothing to the user.** Every other mutation in
    the builder toasts, but `publish` only invalidated its query, so a leader
    got no confirmation for the most consequential action in the feature. Added
    success/warning/error toasts in `use-cycle-builder`, distinguishing
    `published: false` (below target, unconfirmed) from a real publish. Found by
    the smoke spec — the app was wrong, not the test.

28. **`cycle-board-scroll` is a ScrollArea root and never scrolls.** The smoke
    spec measured `scrollWidth > clientWidth` on it and got false even though
    the board is `min-w-[960px]`. The scrolling element is the viewport, which
    already exposes `cycle-board-viewport`. Spec repointed.

29. **Item 24 was wrong — the duplicate `ministry-cycle-assign-link` is
    intentional.** The mobile card and the desktop table both mount, one hidden
    by CSS, which is how the responsive specs test both layouts. Not an app
    defect; the spec needed to disambiguate.

30. **Stale builder selectors repaired.** The cell's picker trigger is `Add`
    (`Assign <name>` appears only once a volunteer is selected in the rail); the
    date-strip buttons are `Show only <short weekday>, <short month> <day>`, not
    the long format with year. Added `picker-option-name` so the reassignment
    assertion reads the candidate's name from its own element instead of slicing
    display text.

31. **`StaffingMeter` is orphaned.** Exported but rendered nowhere — the board
    redesign replaced it with a per-date readout, now `cycle-date-staffing-percent`.
    The component is dead code and should be deleted once the redesign settles.

32. **E2E specs share one seeded database and mutate each other's state.**
    `smoke > tailoring lets a leader reach the cycle builder` passes alone and
    fails in the full run: "Open roster" only renders while the participation is
    past `tailoring`, and another spec moves it. Not a drift in this feature but
    a structural weakness in the E2E setup — it makes any state-dependent
    assertion order-dependent.

## E2E order-dependence — root cause and fix

33. **It was never flaky; it was order-dependent.** `playwright.config.ts` sets
    `workers: 1`, so files run serially in path order — the same result every
    run. Item 32's "flakiness" reproduced exactly on demand, which is what made
    it bisectable.

34. **`smoke > tailoring lets a leader reach the cycle builder` fixed.** Bisected
    to `planning-cycles-table-view.spec.ts`, which correctly creates its *own*
    uniquely-named cycles. It never corrupted the seed — it grew the cycle list,
    and smoke clicked the *first* "Open roster", which stopped being the seeded
    cycle's. Fixed by deep-linking to the seeded cycle and its own participation
    id instead of relying on list position. The lesson generalises: any spec
    selecting by `.first()` from a list other specs can append to is
    order-dependent by construction.

35. **`single-create-event-ui` (FR-012) fixed.** `/scheduling` is now a redirect
    to `/scheduling/planning-cycles` (the FR-015/016 nav restructure), so the
    "ministry ad hoc New Event" entry point the spec expected no longer exists —
    and that is precisely *how* FR-012 is satisfied: there is exactly one
    create-event surface, reached by "Add event". The spec now asserts the
    redirect plus the single canonical form, so reintroducing a second surface
    fails the test.

36. **`us4-roster-publish` — same root cause, needs a fixture decision.**
    It asserts the Worship participation starts at "Availability requested", but
    receives "Published": `smoke.spec.ts` sorts before `us4-` and publishes that
    same Worship cycle. Its middle section also drives removed UI
    (`roster-page`, `roster-completion-summary`, `publish-participation-button`).
    Its valuable assertions — sibling ministry stays unpublished, volunteer sees
    the published slice — are API-level and still correct. It cannot simply be
    repointed: the leader is only a `volunteer` in the Care ministry, so the test
    cannot publish Care instead, and there is no second unpublished Worship
    cycle to use.

## E2E fixture isolation — us4

37. **`us4-roster-publish` now owns its own planning cycle.** The seed gained
    `E2E_IDS.us4PlanningCycle` (2027-02-01 → 2027-03-01, locked) carrying one
    event, `E2E US4 Publish Service`, with a Worship *and* a Care participation
    both seeded at `availability_fired`. Publishing is cycle-wide for one
    ministry, so a spec that publishes must own the cycle it publishes —
    sharing the December cycle let whichever file sorted first decide the
    participation state. The date range sits between the seeded December cycle
    and the year-2400 range the create-cycle specs generate for themselves, so
    it overlaps neither. Both ministries start at the same state on the same
    event, which is what makes the cross-ministry isolation assertion turn on
    the publish alone.

38. **The spec's middle section was rewritten onto the cycle builder.** The
    per-participation roster page it drove (`roster-page`,
    `roster-completion-summary`, `assign-<requirementId>-<volunteerId>`,
    `publish-participation-button`) exists in no source file — the builder
    replaced it and publishing is now cycle-level. The API-level assertions
    (Worship ends `published`, sibling Care stays `availability_fired`, the
    volunteer sees the published slice) are unchanged; the below-full step is
    now asserted through the publish dialog's "shifts are below their staffing
    target" copy plus a 1/2 Usher cell.

39. **The volunteer is picked by name from the rail, not `.first()` from the
    picker.** The dashboard half of the journey asserts on one specific person,
    and the picker's ordering is availability- and workload-driven, with
    suggested candidates excluded from the list entirely. Filtering the rail by
    name and using its "Select slot" → "Assign …" path names the volunteer
    instead of depending on ordering — item 34's rule applied to a picker
    rather than a list.

40. **The assignment chip renders the full volunteer name; the rail and the
    volunteer dashboard abbreviate it** (`formatVolunteerName`, "E2E V."). The
    chip also passes `fullNameOnExpand` to `AssigneeIdentityBadge`, which reads
    as though the chip was meant to abbreviate too. Not changed here — it is a
    display decision, and the spec asserts each surface's actual form. Worth a
    product answer before someone "fixes" one of the two.

41. **The systemic fix is still open.** Items 32–34 and this one are the same
    class: one globally-seeded database shared by every spec file. us4 is now
    isolated by convention (its own cycle), not by construction. The durable
    fix — re-seeding between spec files, or a per-spec cycle enforced somewhere
    — remains unproposed and deliberately out of this change.
