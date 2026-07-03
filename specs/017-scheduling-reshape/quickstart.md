# Quickstart: Scheduling Reshape

End-to-end walkthrough of the five user stories against the new church-owned model. Use this as the manual acceptance script and the shape for the Playwright E2E suite. Assumes the greenfield schema is applied and seed data (a church, ministries with `defaultDirection`, memberships, roles/teams, one Sunday + one Wednesday `EventTemplate`, a Projection serving profile) is loaded.

## Prerequisites

```bash
# from repo root
bun install
docker compose up -d            # Postgres + Unleash
bun run db:reset                # greenfield: drop + recreate scheduling schema
bun run db:seed                 # cycles/templates/participations demo data
bun run dev                     # server + web
```

Verification gates (run per phase, per `agents.local.md`):

```bash
bun run check          # Biome lint + format + layer boundaries
bun run check-types    # tsc strict
bun run test           # Vitest unit + integration
bun run test:e2e       # Playwright
```

## US1 — ChurchAdmin plans and locks a period (P1)

1. As **ChurchAdmin**, `POST /admin/planning-cycles` with next month's range → cycle in `draft`, visible to admin only.
2. `POST /admin/planning-cycles/:id/apply-templates` with the Sunday (3 blocks) + Wednesday (1 block) template ids → one `Event` per matching date, one `TimeSlot` per block, each slot carrying `sourceTemplateBlockId`. Ministry participations auto-seed from serving profiles.
3. `POST /admin/planning-cycles/:id/events` for a 3-day dynamic retreat whose end date leaks past the cycle end → event belongs to this cycle (by start date), extends beyond.
4. Attempt a second cycle overlapping the first → `409` (FR-002, SC-005).
5. `POST /admin/planning-cycles/:id/lock` → events become `scheduled`, cycle `locked`, visible to leaders, still hidden from volunteers.
6. Add a new event to the locked cycle → allowed (append-only). Edit a locked event → requires `reopen` first.

**Pass**: correct events/slots on exactly the right dates; overlap rejected; lock flips visibility; append-only enforced. (SC-001: full month generated + locked < 10 min.)

## US2 — Ministry Leader tailors participation & fires availability (P2)

1. As **Projection leader**, `GET /leader/cycles/:id/participation` → two Sunday blocks pre-included (from profile), third off; respects ministry `defaultDirection`.
2. `POST …/slots/:slotId/shifts` with `{kind:'equal-n', n:2}` on one slot → two shifts, each within the slot bounds. Try a manual span outside the slot → `409`.
3. `PUT /leader/shifts/:shiftId/requirements` → per-shift, per-role headcount owned by this participation.
4. `POST …/fire-availability` → one `AvailabilityCheck` per active membership; only those volunteers notified, once for the cycle; participation `→ availability_fired`.
5. A ministry with `all_in` default → every slot pre-included; leader opts a few out.

**Pass**: seeding respects profile + default direction; shift bounds enforced; only intended volunteers get one check. (SC-002: locked cycle → fired < 5 min with profile.)

## US3 — Volunteer declares availability & confirms (P2)

1. As a **volunteer in two ministries**, `GET /volunteer/availability-checks` → two items; all shifts available by default.
2. `PUT …/marks` with one `shiftId` (or a whole date) → only those shifts unavailable; rest available.
3. `POST …/confirm` with zero marks → still requires confirm; `pending → confirmed` + `confirmedAt`; leader can distinguish acknowledged vs not-looked.
4. Available for two overlapping shifts in different ministries same date → per `VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE`: blocked until one dropped, or confirmed with a conflict flagged to leaders.

**Pass**: default-available; only marks recorded; confirm gate mandatory; overlap policy behaves per flag. (SC-003: zero-exception acknowledge < 30 s. SC-007.)

## US4 — Ministry Leader rosters & publishes (P3)

1. `GET /leader/shifts/:id/eligible-volunteers` → ranked by availability, then least-recent serving (FR-021).
2. `POST …/assignments` → completion % rises (FR-022). Assign a volunteer already on an overlapping shift → soft warn or hard block per ministry `enforcementType`; hard needs audited override `{ reason }`.
3. Leave one slot unfilled; `POST …/publish` with `{confirmBelowFull:true}` → published below 100%; only this ministry's volunteers see their slice; other ministries on the same event unaffected.

**Pass**: ranking correct; completion tracks; conflict enforcement + audit; per-participation publish isolates ministries. (SC-004, SC-006.)

## US5 — Live execution & late changes (P4)

1. As a **volunteer**, `POST /volunteer/assignments/:id/cancel` on an assignment that is yours → leader notified promptly; slot reopens. Cancel someone else's → `403`.
2. As **leader**, `PATCH /leader/assignments/:id/reassign` mid-cycle → roster updates; affected volunteers informed.

**Pass**: self-only cancellation; prompt leader notification + slot reopen; mid-cycle reassignment works. (SC-008: notify + reopen within seconds.)

## Cross-cutting checks

- **Church isolation**: every query filtered by `church_id`; no cross-church leakage.
- **Two publishes**: cycle-lock (admin) and roster-publish (leader) are independent; `Event.status` never becomes `published`.
- **No RoleTemplate**: role-template routes/entities absent; counts come from serving profiles or manual entry.
