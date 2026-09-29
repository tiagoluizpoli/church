# Spec S3: Cohesive Seed Data and Fixture Workflows

> **Supersedes the original local-seeding specification.** The former design placed application scenarios in `packages/db`, generated generic Faker data, and referred to the retired `system_role` / `sub_leader` model. [ADR 0006](../../../docs/adr/0006-server-owned-seed-subsystem.md) and [issue #320](https://github.com/tiagoluizpoli/church/issues/320) are authoritative for the replacement.

## Purpose

Provide one understandable, deterministic system for development data, integration fixtures, and E2E journey data. The purposes share database-building primitives while retaining separate recipes, isolation, and lifecycle behavior.

## Ownership and boundaries

- Application-specific builders, blueprints, recipes, and seed verification live under `apps/server/seeds`.
- `@church/db` owns only generic schema, connection, migration, transaction, reset, and target-safety capabilities.
- Reusable database construction is central. A test may keep assertion-specific values and orchestration beside the test while calling the central builders.
- Required domain origins use their application workflow, including Church Provisioning. Explicit direct-state builders are allowed for bulk data and fixture states that a public workflow cannot or should not create.
- The frontend package never depends on database tooling. Playwright invokes the server-owned E2E recipe through its test runner.

## Development workflow

The one supported manual workflow is:

```bash
bun run db:reseed:dev
```

The command MUST:

1. Resolve and print the redacted, worktree-scoped development database target.
2. Refuse an unrecognized, cross-worktree, integration, E2E, or production-like target before destructive work.
3. Reset and migrate through the guarded development database path.
4. Load the scenario transactionally and report no success for a partial graph.
5. Default its anchor to today in the Church Timezone and accept `--anchor=YYYY-MM-DD` for reproduction.
6. Verify the seeded graph's critical counts and invariants before reporting success.

The former `db:seed`, `db:seed:reset`, `db:seed:dev-users`, `db:seed:reset:dev-users`, and dashboard-demo workflows are replaced. No scenario dispatcher is required until a second manual scenario exists. Running the seed MUST NOT rewrite or generate a repository document.

## Blueprint and identities

The default development scenario is declared in a small set of typed TypeScript blueprint files, composed by one entry point. It uses fixed fake names, deterministic `.test` email addresses, and one development-only password. Every generated Volunteer has a complete User and credential account and can authenticate; no real personal data is committed.

The primary Church uses `America/Sao_Paulo` and approximately 305 Ministry Memberships, with 20–30 deliberate cross-Ministry overlaps:

| Ministry | Memberships | Teams | Roles |
| --- | ---: | --- | --- |
| Projeção | 15 | — | Operador de Projeção |
| Kids | 150 | Kids, Maternal | Líder, Auxiliar |
| Intercessão | 100 | — | Intercessor |
| Estacionamento | 40 | — | Orientador de Estacionamento |

Kids has two active Ministry leaders. Additional TeamLeaders remain scoped to Kids or Maternal. Per served block, Kids requires `1 Líder + 7 Auxiliares`, Maternal requires `1 Líder + 3 Auxiliares`, Intercessão requires 8 Intercessors, and Estacionamento requires 4 Orientadores de Estacionamento.

A small second Church provides Church switching and tenant-isolation examples. Multi-Church Users may hold Church Membership in both Churches but retain active Volunteer participation in only one Church.

## Gatherings and historical data

The blueprint defines these recurring gatherings:

- Sunday: `08:00–09:30`, `10:30–12:30`, and `18:30–20:30`.
- Wednesday: `20:00–22:00`.
- All four Ministries serve the Sunday and Wednesday gatherings except that Kids and Maternal do not serve Sunday at 08:00.
- Projeção requires one operator Sunday at 08:00 and two operators for every other regular gathering.
- `Encontro Teens` is one manually created monthly Saturday Event at `19:00–21:00`, with only Projeção participating; the seed does not misrepresent it as weekly recurrence.

The scenario seeds EventTemplates and MinistryServingProfiles, then materializes only the previous complete calendar month as a locked historical PlanningCycle whose MinistryParticipations are mostly staffed and published. It includes a small coherent history of unavailability, declines, replacements, and cross-Ministry service without an unresolved invalid overlap. Current and future ranges remain empty so the complete PlanningCycle creation journey can be exercised manually after every reseed.

Until [BL-032 / #319](https://github.com/tiagoluizpoli/church/issues/319) is designed and delivered, Projeção's two placements use one `Operador de Projeção` SlotRequirement with headcount `2` and notes `1 Templo, 1 Kids`. The seed MUST NOT invent permanent Teams or duplicate Roles to hide that limitation.

## Automated recipes

- **E2E:** reset once per suite, share read-only identities and authentication state, and compose a distinct stable mutable graph per journey. A retry can recreate its journey graph without depending on another journey's mutations.
- **Integration:** keep assertion-specific arrangement local while using the central builders for database construction.
- **Development:** use the full realistic blueprint above and the canonical reseed command.

[Issue #223](https://github.com/tiagoluizpoli/church/issues/223) remains responsible for its concrete fixture, product, and journey-contract failures. Its fixture corrections MUST use this subsystem and MUST NOT introduce another seed path.

## Drift enforcement and verification

- Relevant schema or persistence/domain changes run the seed contracts and must update the subsystem or explicitly acknowledge no seed impact.
- A focused contract test loads every curated recipe and checks its critical invariants.
- The development workflow succeeds twice consecutively and reproduces the same graph apart from deliberately time-derived or audit fields.
- Verification covers Ministry membership counts, both Kids Ministry leaders, Role and Team existence, authentication structure, the locked historical cycle and its published participation staffing, tenant isolation, and active-Volunteer uniqueness.
- Wrong-purpose and wrong-target tests prove refusal before reset.
- `bun run validate:affected` and final `bun run validate` must pass before implementation handoff.

## Scope boundaries

- Worktree bootstrap continues to provision and migrate databases without application-data seeding.
- [BL-028 / #318](https://github.com/tiagoluizpoli/church/issues/318) owns the repository-wide test-tree migration; this work uses its intended final boundaries without absorbing it.
- [BL-032 / #319](https://github.com/tiagoluizpoli/church/issues/319) owns Assignment-to-SlotRequirement binding and labelled staffing posts.
- Monthly recurrence, stress-sized data, and a general interactive seed CLI remain out of scope.
