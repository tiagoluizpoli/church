# Date & Time Seam, Church-Timezone Truth, and Time-Entry Direction

## Status

accepted

## Context

`specs/004-timezone-date-policy/spec.md` (May 2026) established the core storage policy — UTC in `timestamptz`, compute in UTC, convert at render, IANA names never fixed offsets — and that core holds. But 004 was written before the domain distinguished a calendar day from an instant, said nothing about time format, never covered manual event creation (the shipped client write path stamps literal UTC midnight instead of converting through the church timezone), and assumed a User-local display mode that was never really reachable end to end.

An inventory of the repository (~250 production date/time construction sites across 110 files, [church#127](https://github.com/tiagoluizpoli/church/issues/127)) found the two known bugs are the majority behavior, not outliers: exactly one web file resolves a date in the church timezone, and the volunteer-facing surface has no timezone indicator anywhere, in direct contradiction of 004 FR-007. It also found 004's own SC-001 is false — `planning_cycle.start_date/end_date` and `time_block.start_time/end_time` are correctly *not* `timestamptz`; the schema is more right than the spec that was meant to constrain it.

This ADR is the destination of map issue [church#126](https://github.com/tiagoluizpoli/church/issues/126) ("Date & time: one enforced seam, church-timezone truth, and a time-entry direction"), which charted and resolved nine decision tickets ([#127](https://github.com/tiagoluizpoli/church/issues/127), [#128](https://github.com/tiagoluizpoli/church/issues/128), [#129](https://github.com/tiagoluizpoli/church/issues/129), [#130](https://github.com/tiagoluizpoli/church/issues/130), [#131](https://github.com/tiagoluizpoli/church/issues/131), [#132](https://github.com/tiagoluizpoli/church/issues/132), [#133](https://github.com/tiagoluizpoli/church/issues/133), [#136](https://github.com/tiagoluizpoli/church/issues/136), [#137](https://github.com/tiagoluizpoli/church/issues/137)). It consolidates those decisions into one record and states 004's disposition line by line. Nothing here has been implemented — this is a planning artifact; the two known bugs remain open and land as tickets off the spec this ADR now unblocks.

## Decision

### Vocabulary

The domain now has three kinds of time, not two — **Instant**, **CalendarDay**, **TimeOfDay** — plus **Church Timezone** as the only lens that relates them, meeting one way: `TimeOfDay + CalendarDay + Church Timezone → Instant`. Full definitions live in `CONTEXT.md`'s `## Time` section (landed via [#128](https://github.com/tiagoluizpoli/church/issues/128)); this ADR uses those terms as given rather than restating them.

Two consequences of adopting this vocabulary:

- **Event bounds are always Instants**, day-based events included. Polymorphic bounds (CalendarDay for day events, Instant for timed ones) were rejected — the tradeoff accepted is that a retreat's days would shift if a church's timezone were ever corrected after the fact. The `_date` suffix comes off `start`/`end` — the concept is Event **start**/**end**.
- `time_block`'s `start < end` invariant comes off. An end before its start now means the block crosses midnight onto the next CalendarDay; the check is replaced by a computed-span confirmation shown in the entry form (see Time-entry direction, below).
- Root cause named for the drift that let this happen: **response DTOs erase the distinction the request DTOs encode** — a value goes in typed as an Instant, CalendarDay, or TimeOfDay, and comes back as an untyped string. Closing this (tightening response DTOs server-side) is required by the seam, below.

### Church Timezone is the sole source of truth; the toggle is retired

Per-user/per-viewer timezone display is removed. There is one timezone in, one out, and it is always the church's.

- `timezone` is added to the DTO the active-church gate fetches (`GetActiveChurchStatus200`, which today carries only `status`/`churchId`/`membershipRemovedFrom`) — a bare `timezone: string`, not a settings envelope. The church-*picker* list already carries a timezone field; it was never on the status contract the app actually gates on.
- Delivered as route context from `_active-church.beforeLoad`, provided at `ActiveChurchLayout`. Because `beforeLoad` blocks, there is no placeholder, no flash, and church switching gets a correct timezone for free on remount.
- The context survives, mounted under the gate. `apps/web/src/main.tsx`'s `Wrap` sits *above* church resolution today — that's the root cause of the hardcoded `initialChurchTimezone="America/New_York"` constant, and scoping the context under the gate loses nothing: every wall-clock route is already under `_active-church`; everything outside it renders only through `formatDistanceToNow`.
- **Names stay neutral**: `TimezoneProvider`/`useTimezone` are unchanged; only the `initialChurchTimezone` prop is renamed to `churchTimezone`. A policy-bearing rename was considered and rejected — the failure mode this effort found is agents *never reaching* the provider (14 browser-timezone call sites vs. 4 consumers of `useTimezone()`), not misusing it once there, so a scarier name buys nothing and would work against a later display-timezone option.
- **The toggle is deleted with no UI replacement.** Church time is implied for anyone serving. This amends 004 FR-007 (see disposition table below) from "display an explicit indicator" to "there is no viewer's timezone to indicate."
- `TimezoneProvider`'s `localStorage` persistence is removed — 004 already specified the toggle as transient UI state; the shipped code persisted it anyway.
- `getBrowserTimezone` is deleted (zero production consumers once the toggle is gone).
- **Display zone and structural Church-Timezone lens are two roles**, identical today, that must not collapse into one API — they diverge only if a per-user display timezone ever ships. The seam (below) keeps them separate.

### The `@church/time` seam and its enforcement

One seam for all date/time logic: a new package, **`@church/time`** — not `packages/core` (which is zero-dependency by design) and not one seam per app. The reason it must be its own package: the enforcing lint rule is written against the *import path* ("no `date-fns`/`date-fns-tz` outside `packages/time/**`"), which needs no allowlist only if the seam has a dedicated, unambiguous path.

- **All three kinds from the vocabulary section are branded types.** `Instant` is a branded ISO string, not a `Date` — so a raw `Date` never legitimately exists outside the seam, which is what makes the lint rule unconditional rather than needing per-file exceptions.
- Closing **response-DTO erasure** (tightening the server-side response DTOs to carry the branded types) is required for the seam to hold end to end.
- **`now()` joins the seam** (88 non-test call sites) as a plain imported function with a module-level test override — not an injected `Clock`. Dependency injection was rejected: it would mean threading a clock through roughly 13 entity constructors for timestamps no test actually asserts on. Roughly 42 of the 88 sites are audit metadata; the migration fixes zero known bugs on its own, but buys a rule with no carve-outs, and means `now` is never migrated again.
- The premise "make `now` follow the church timezone" is rejected as incoherent — `new Date()` has no timezone. What's real, and what the seam exposes, is `today(tz): CalendarDay` and `currentTimeOfDay(tz): TimeOfDay`. That shape already exists correctly in `apps/server/src/test-support/clock.ts` with zero production consumers; it moves into `@church/time`.
- **`mode: 'string'` (drizzle's `PgTimestampString`) is disqualified on correctness, not deferred.** It staples the *process-local* offset onto the *UTC* wall clock: under `TZ=America/Sao_Paulo`, a `17:38:52Z` row round-trips to `20:38:52Z` (and under `TZ=Asia/Kolkata`, the `+05:30` offset drops the `:30` entirely) — verified as the branch the node-postgres driver hits. Recorded here as a landmine: nobody should "fix" this inconsistency into a bug later.
- **`toDate`/`fromDate` (Instant ↔ `Date`) live in `@church/time`**, called from the 19 entity mappers and 15 repository query sites that need them. This is not database logic leaking into the seam — both directions are unimplementable outside it, since they need `new Date`/`.toISOString()` directly. They do not live in `mapper-utils.ts` (dead code, zero consumers — deleted) and not behind a mapper base class (all 18 mappers are stateless plain functions; none need injected config — `church.mapper.ts:66` already reads the timezone directly off the row).
- **Enforcement**: `noRestrictedImports` for both `date-fns` and `date-fns-tz`, plus a GritQL plugin rule catching bare `new Date`, wall-clock accessors, `.toISOString()`, `toLocale*`, and `Intl.DateTimeFormat` — verified against Biome 2.4.10. `overrides` cannot exempt a path from a plugin rule (tested); the seam exempts itself via `$filename` matching *inside* the rule instead.
- Scope: web, server, and db packages; exempted: `db/src/schema/**` and all test files (~115 sites — branding already routes tests through the seam wherever it matters).
- **Honest ceiling**: `biome-ignore` suppresses the plugin's diagnostics and cannot be disabled at the tool level. Accidental reintroduction is closed by the rule; deliberate bypass is only made *visible*, not prevented — so CI additionally greps for `biome-ignore` comments suppressing these specific rules (the legitimate count is zero).
- **Web-side**: `useTimezone()` is the sole supplier of the church timezone value; the five plain `.ts` display modules take it as a parameter rather than reading it themselves, keeping the display-zone / structural-lens roles distinct.
- `toTZ` is deleted (it returns a deliberately-wrong `Date`; zero consumers). `fromTZ` is renamed to `toInstant(day, time, tz)`.

### Time format: constants, not configuration

There is no time-format configuration. 24-hour time and `dd/MM/yyyy` dates are **constants inside `@church/time`**; nothing is stored in the database and no API contract carries a format field. The `church.settings` jsonb column stays in the schema, unused — it has zero readers today, one legal value, no writer, and no UI, which makes it a constant wearing a settings column, not an actual setting.

- Scope is wider than "time format" alone: dates violate the same "no viewer's clock" principle today (`'PP'` renders `Jan 4, 2027`, while `date-picker-field.tsx` — under test — uses `'dd/MM/yyyy'`), so this decision covers one authored presentation, dates and times together.
- Scale: beyond the 10 sites calling `format` directly, 16 more call `toLocale*` (most with no arguments at all), almost all under `features/volunteers/` — the audience already missing a timezone indicator ([#127](https://github.com/tiagoluizpoli/church/issues/127)) is also the one worst served here.
- **Public surface — nine intent-named functions**: `formatCalendarDay` (`04/01/2027`), `formatCalendarDayWithWeekday`, `formatWeekday`, `formatDayAndMonth`, `formatTimeOfDay` (`14:30`), `formatInstant`, `formatInstantPrecise` (adds seconds, for audit-shaped reads), `formatRelative`, `formatRecency`.
- **Four rules govern the surface**: no format-string argument anywhere (no `formatStr`, no options bag, no `locale`); no locale-derived formatting *inside* the seam either (`'p'` under `en-US` renders `10:30 AM` — the display half of the 24h lock); separate functions rather than a parts object (callers compose layout, the package owns format); and words stay English until a dedicated i18n pass, which will live inside this same package.
- Seconds are an Instant-only property, never part of TimeOfDay (which CONTEXT.md defines as hour-and-minute) — hence `formatInstantPrecise` as a distinct function rather than an option on `formatInstant`. Milliseconds are never formatted.
- **`formatRecency` lives in the seam** because the seam bans `new Date` everywhere else, so no caller outside it can compute "older than a week" itself. Threshold: 7 days on the absolute distance (so `in 3 days` also renders); a boolean "past/future" parameter was rejected as unreadable at call sites.
- Enforcement dividend: because no format string ever crosses the package boundary, grepping for the `p`/`P` token family outside `packages/time/**` is a *complete* check — added to CI's grep alongside the `biome-ignore` check above.
- **One named exemption**: `components/ui/calendar.tsx` (vendored shadcn over `react-day-picker`; owns its own rendering) is exempt by filename and is never edited, which is what keeps `shadcn add` safe to re-run. Exempting `components/ui/**` wholesale was rejected as a hole that grows over time. Forking the calendar to inject church logic was also rejected — a CalendarDay carries no offset, so there is no church logic to inject; the string a user reads already flows from `date-picker-field.tsx` through `formatCalendarDay`.

### Time-entry component direction

The real surface is **nine time inputs across five components**, not the four `type="time"` inputs originally charted — five of the nine are `datetime-local`. Replacing only the four `type="time"` boxes would have left five inputs still rendering in the browser's locale (e.g. `10:30 AM`), violating the locked 24-hour format.

- **Direction: a segmented field with an in-field quick list.** React Aria's `TimeField` (`hourCycle={24}`, already a direct dependency), with a chevron inside the field opening a keyboard-navigable listbox of 15-minute times.
- **Arbitrary minutes stay enterable** — 15 minutes is a fast path, never an enforced constraint. Every literal time value already in the repo (13 distinct values, ~100 occurrences) lands on a `:00`/`:30` boundary, which justifies optimizing for the grid but does not justify enforcing it, and rules out any enumerated-list-only control.
- **Audience is the leader/planner**, not the Volunteer — no Volunteer ever types a time; all nine inputs sit under `planning-cycles` and `tailoring`. This is desktop-primary, mobile-working, not a once-a-month mobile tap target. React Aria already sets `inputmode="numeric"`, `contenteditable`, `enterkeyhint="next"`, and `autocorrect="off"` on every segment, so a handset raises the number pad, never the full keyboard or an OS wheel.
- **Rejected alternatives**: a free-text type-ahead (accepts malformed input like `12121:12312`, can't be arrow-stepped, where the segmented field refuses impossible values by construction — `99` in the hour segment yields `09:09`); a touch stepper (rejected on scale — `manual-split-editor.tsx` renders unbounded spans, each with four stepper columns).
- Refinements made while prototyping: the chevron moved inside the field (segments need ~5 characters; the rest was dead space), and the list became a real listbox (Up/Down, PageUp/Down by the hour, Home/End, Enter, Escape; options are non-focusable under `aria-activedescendant`).
- Every variant renders the computed-span confirmation from the Vocabulary section above (e.g. "Runs 4h · ends next day") rather than rejecting an end time before the start.
- **Two implementation costs recorded for whoever builds this**: `@internationalized/date` must be pinned to the exact version `react-aria-components` resolves (3.12.2 at time of writing — `latest` breaks with `Type 'Time' is not assignable to 'TimeValue'`); and opening a long list scrolled to the current value inside a portalled popover needed four separate fixes, the last because base-ui resets `scrollTop` once the open animation settles.
- **The control is the shadcn registry component**, installed via `shadcn add @intentui/time-field` (`@intentui` is a shadcn-CLI registry `apps/web/components.json` already declares) and retokened after install — the installed file ships intentui's own palette (`text-fg`, `muted-fg`, `primary-subtle`), none of which exist in this project, so it renders unstyled until retokened. Its `date-field` dependency and a redundant `cn@0.3.0` package are dropped.
- Found in passing, not fixed here: `components/ui/field.tsx` is a pre-existing, unstyled intentui component with zero importers — dead code from a half-finished earlier intentui install.
- A prototype exists as an implementation reference (not for merging): branch `prototype/time-entry-direction`, route `/prototype/time-entry?variant=B`. `components/ui/time-field.tsx` on that branch **is** production-ready — copy it rather than re-running `shadcn add` (which would reinstall the unstyled tokens); its `SegmentedWithListControl`, `readSegments`, and `optionsFor` helpers are worth lifting directly.

### Data cutover: no migration

There is no live production data — every existing row is seed or manual test data. Per-row repair of already-corrupted timestamps is therefore not owed. The cutover is a clean line: **pre-seam rows are dropped and environments are reseeded**, safe because the seeder already writes through the correct server-side path. (The corrupting code — 3 functions, 8 call sites, across the `event`, `time_slot`, and `shift` tables — is replaced outright by the seam, not patched, so the exact count doesn't change the outcome.)

### Regression-test strategy

- `now()`'s test override is **`setTestClock(instant)` / `resetClock()`**, plain module-level exports (no DI object — consistent with `now()` being a plain function above). Reset explicitly per test file (`afterEach`) plus a global safety-net `afterEach` in shared vitest setup.
- `apps/server/src/test-support/clock.ts`'s `Clock`/`FixedClock` types are deleted (zero production consumers; only referenced by their own test). `toChurchDate` — despite living under `test-support/` — has 3 real production call sites and moves into `@church/time` as `today(instant, tz): CalendarDay`, which collapses `getCurrentChurchDate` away entirely.
- **CI runs under a non-UTC, non-Brazil ambient `TZ`.** Today CI sets none, defaulting to the GitHub Actions runner's UTC — exactly the condition that would hide an ambient-timezone-dependent bug like the `mode: 'string'` landmine above.
- **1–2 fixtures on a DST-observing IANA zone**, placed around a real transition — scoped modestly because the real audience (Brazil, per the Time-format section) never crosses a DST boundary.
- **The GritQL enforcement rule itself gets a fixture test.** There is no existing precedent for this in the repo (`require-named-object-parameters.grit` ships untested today), and the entire seam's guarantee rests on this rule staying armed across future Biome upgrades.

## Disposition of `specs/004-timezone-date-policy/spec.md`

004's core survives: store UTC in `timestamptz`, compute in UTC, convert at render, IANA names never fixed offsets. What follows is the line-by-line disposition.

### Functional Requirements

| # | Requirement | Disposition | Note |
|---|---|---|---|
| FR-001 | Persistence Layer MUST store all date/time values in UTC using timezone-aware types. | **Amended** | Scope clarified, not weakened: applies to Instant-valued columns only. `planning_cycle.start_date/end_date` and `time_block.start_time/end_time` are CalendarDay/TimeOfDay-valued and are correctly *not* timezone-aware ([#127](https://github.com/tiagoluizpoli/church/issues/127)). |
| FR-002 | Backend MUST perform duration calculations, overlaps, and conflict checks exclusively in UTC. | **Kept** | Unchanged; consistent with the Instant model. |
| FR-003 | Presentation Layer MUST convert UTC timestamps to a target timezone (Church-local or User-local) only at render. | **Amended** | "User-local" no longer exists — the toggle is retired. Conversion is to the Church Timezone only, still exclusively at render. |
| FR-004 | System MUST allow configuring a Home Timezone per Church; new churches default to UTC. | **Kept** | The `timezone` attribute and default-on-creation policy stand; no admin UI to change it is in scope here (see Follow-ups). |
| FR-005 | API Layer MUST accept/return ISO 8601 strings with explicit UTC indicators (`Z`). | **Kept** | Consistent with `Instant` being a branded ISO string in `@church/time`. |
| FR-006 | System MUST handle DST via IANA timezone names, never fixed offsets. | **Kept** | Unchanged. |
| FR-007 | Availability input components MUST display a prominent timezone indicator reflecting the Church's timezone. | **Amended** | Reversed, not refined: the toggle and any indicator are removed entirely. Church time is implied for anyone serving — there is no viewer's timezone left to indicate ([#129](https://github.com/tiagoluizpoli/church/issues/129)). |

### Key Entities

| Entity | Disposition | Note |
|---|---|---|
| Church (`timezone` attribute) | **Kept** | Remains the sole source of truth. |
| Event Slot (`start_at`/`end_at` as UTC timestamps) | **Superseded** | Replaced by the three-kind model: Event start/end are Instants; PlanningCycle bounds are CalendarDays; TimeBlock bounds are TimeOfDay. No single "Event Slot" shape covers all of these. |
| Volunteer Availability (UTC timestamps; recurrence anchored to Church-local) | **Kept** | Not directly revisited by this effort's tickets; nothing found contradicts it. |

### Success Criteria

| # | Criterion | Disposition | Note |
|---|---|---|---|
| SC-001 | 100% of date/time columns use timezone-aware storage. | **Superseded** | False as written — the schema was more right than the spec. Replacement: every Instant-valued column is timezone-aware; CalendarDay/TimeOfDay-valued columns are correctly not ([#127](https://github.com/tiagoluizpoli/church/issues/127)). |
| SC-002 | Integration tests confirm availability matching across ≥3 timezones with varying DST rules. | **Amended** | Narrowed to the actual audience: CI runs under a non-UTC, non-Brazil ambient `TZ`, plus 1–2 fixtures on a DST-observing zone around a real transition ([#137](https://github.com/tiagoluizpoli/church/issues/137)). |
| SC-003 | Frontend renders correctly in both Church-local and User-local modes without refresh/layout shift. | **Amended** | User-local mode no longer exists; the criterion narrows to Church-local rendering only. |

### Assumptions

| Assumption | Disposition | Note |
|---|---|---|
| `date-fns`/`date-fns-tz` are the standard for date manipulation. | **Superseded** | Both are banned everywhere outside `packages/time/**`; only `@church/time` may import them directly ([#131](https://github.com/tiagoluizpoli/church/issues/131)). |
| Browsers provide reliable timezone info via `Intl.DateTimeFormat().resolvedOptions().timeZone`. | **Superseded** | Moot: `getBrowserTimezone` is deleted along with the toggle; nothing reads the browser's timezone anymore. |
| Historical data correction for timezone changes is out of scope; absolute UTC timestamps are preserved even if a church's timezone changes. | **Kept** | Consistent with the no-migration cutover ([#136](https://github.com/tiagoluizpoli/church/issues/136)). |
| Church-local time is the primary display reference by default; the User-local toggle is transient. | **Superseded** | Not "by default" — the only mode. The toggle is deleted, not made more transient. |

## Consequences

- The map's destination is reached: a locked set of date/time decisions now exists for someone to write **one spec** covering the enforced seam, church-timezone plumbing, the 24h format, and the time-entry direction. Map issue [church#126](https://github.com/tiagoluizpoli/church/issues/126) is complete.
- Every future date/time change in web, server, and db is constrained to `@church/time`, mechanically enforced by lint + GritQL + a CI grep — the first time this repository has closed a rule this way.
- Two known bugs remain **unfixed by this ADR** (planning-only; no code changed) and must be filed as tickets against the future spec:
  1. The client write path (`quick-create-event-modal.tsx`) stamps literal UTC midnight instead of converting through the church timezone.
  2. `apps/web/src/main.tsx` hardcodes `initialChurchTimezone="America/New_York"` instead of using the real `church.timezone`, which is already served by the API and simply never wired up. This is the worse of the two — it is silently wrong for every church that isn't in that one zone.
- **Deferred, not scheduled** (unchanged from the map's Out of Scope):
  - A church-settings admin UI — there is nothing to edit even after this ADR; `church.settings` stays on the table, unused.
  - Per-user timezone preference / multi-country churches — the reason the toggle is being removed, not a reason to keep it.
  - 12-hour display format — the direction must not preclude it, and its cost is now known (one constant in `@church/time`, one prop on the React Aria family), but nothing 12h is designed or built here.
  - Internationalization — confirmed as a real near-future need (the audience is Brazilian), deliberately not this effort; every displayed word already sits behind `@church/time`, so the i18n pass rewrites one package when it comes.
  - `#20` (sub_leader nav detection) and `#121` (E2E suite failures) — unrelated, already scoped separately.
