# Inventory: every date & time construction site

Resolves [#127](https://github.com/tiagoluizpoli/church/issues/127), a ticket on map
[#126](https://github.com/tiagoluizpoli/church/issues/126). Surveyed `apps/web`,
`apps/server`, `packages/db`, `packages/core` on `develop` @ `72e6619`.

**Fixing nothing.** This is the surface area the seam decision (#131) gets made against.

## Method

Swept `apps/*/src` and `packages/*/src` for `new Date(`, `Date.now(`, `date-fns*`,
`toISOString`, `toLocale{Date,Time,}String`, `Intl.DateTimeFormat`,
`getTimezoneOffset`, `type="time"`, `type="date"`, plus the Drizzle column
constructors `timestamp(`/`date(`/`time(`.

**419 hits**, of which ~250 are in production code across **110 files**. Enumerating
110 files one by one is noise; they collapse into **11 site classes**, and the class
is what the seam decision actually has to rule on. Each class below carries its
population, what it constructs, whose clock it resolves in, and its verdict under 004.

## Headline numbers

| | |
|---|---|
| Files in web/server/db touching a date | 110 |
| Web files that resolve a date in the **church** timezone | **1** (`shared/utils/date.ts`) |
| Web components that consume `useTimezone()` | **4**, all under `planning-admin/` |
| Web files that format a date in the **browser** timezone | **14** |
| Server files importing `date-fns-tz` | **5** |
| Production `new Date()` ("now") calls with no injectable clock | **65**, in 31 server files + 7 in web |
| DB date/time columns **not** timezone-aware | **4** |

The one-line summary: **church-timezone correctness exists in about six files, and the
rest of the codebase reads the browser's clock.** The two bugs charting found are not
outliers; they are the majority behaviour, and the two that were spotted are simply
the two that produced visibly wrong output.

---

## Class 1 — Church-timezone-correct write path (server)

**Population: 4 sites.** Constructs: an **instant**, from a church-local wall clock.
Resolves in: **church**. Verdict: **correct**.

- `domain/services/cycle-event-generator.ts:1,172` — `fromZonedTime(date + time, churchTimeZone)`
- `domain/services/profile-seeder.ts:1,142` — same
- `application/db-planning-event-manager.ts:3,732-738` — `fromZonedTime` for both bounds
- `domain/services/availability-marks.ts:1,25` — `formatInTimeZone(shift.startTime, timeZone, 'yyyy-MM-dd')`

These four are the only places in the repo that convert between a wall clock and an
instant using an IANA name. `availability-marks.ts` is notable as the only site that
derives a **calendar day from an instant in the church's zone** — the operation
`toLocalDayKey` gets wrong on the client (Class 5).

The church timezone reaches these through `church.timezone`, plumbed from
`infrastructure/mappers/church.mapper.ts:66` and threaded as `churchTimeZone` /
`timeZone` through `db-planning-cycle-manager.ts` (5 sites),
`db-planning-event-manager.ts` (14 sites), `drizzle-availability-check.repository.ts:139`,
`db-volunteer-manager.ts:800`. **Server-side plumbing is real and works.** Nothing
equivalent exists on the client.

## Class 2 — Client write path stamping literal UTC

**Population: 3 sites.** Constructs: an **instant**. Resolves in: **UTC, unconditionally**.
Verdict: **wrong** — FR-001/FR-003. This is the reported bug.

- `features/scheduling/components/quick-create-event-modal.tsx:41-46` —
  `new Date(\`${date}T00:00:00.000Z\`)` / `T23:59:59.999Z`. A church west of UTC gets an
  event starting on the previous local day.
- `features/scheduling/components/participation-tailoring.utils.ts:181` —
  `toIsoString(localValue) => new Date(localValue).toISOString()`, where `localValue`
  came from a `datetime-local`-shaped string. Resolves in the **browser**, not the church.
- `features/scheduling/components/planning-admin/planning-admin.utils.ts:364` — same shape.

Worth separating: the modal hardcodes UTC, the other two silently adopt the browser.
Both are wrong, and they are wrong in *different* directions — a seam has to close both.

## Class 3 — Church timezone never reaches the client

**Population: 1 site, infecting everything downstream.** Verdict: **wrong**, and worse
than the reported bug.

- `apps/web/src/main.tsx:17` — `<TimezoneProvider initialChurchTimezone="America/New_York">`.

The real value is served (`churchAPI.schemas.ts:46`, `church.timezone`) and never read.
Every church in the system renders as New York. Note that 004's own migration default
(FR-004) is `UTC`, and `TimezoneProvider`'s own prop default is `'UTC'` — so the
hardcode is not even consistent with the fallback it overrides.

## Class 4 — The toggle

**Population: 1 provider + 1 toggle + 2 mount points.** Verdict: **to be removed**
(map Notes), and **wrong against 004 today** regardless.

- `shared/components/timezone-provider.tsx` — persists `mode` to `localStorage` under
  `church_timezone_mode`. 004's clarification says the toggle is **transient UI state**.
- `shared/components/timezone-toggle.tsx`, mounted at `components/app-shell.tsx:676`
  and `components/user-menu.tsx:83`.
- `shared/hooks/use-timezone.ts` — `format()` delegating to `formatInTZ(effectiveTimezone)`.

`useTimezone()` is consumed by exactly **four components**, all under
`features/scheduling/components/planning-admin/`: `cycle-review-card.tsx:152`,
`planning-cycle-header.tsx:42`, `planning-event-card.tsx:62`, and `calendar-row.tsx`
(which takes `format` as a prop rather than calling the hook). **Nothing else in the
app honours the toggle.** Flipping it changes four surfaces and leaves the rest of the
product — the entire volunteer side — in the browser's timezone. The toggle is not
merely a deferred feature; it is a control that misrepresents what it does.

## Class 5 — Calendar-day derivation from an instant, in the browser's zone

**Population: ~8 sites.** Constructs: a **calendar day**. Resolves in: **browser**.
Verdict: **wrong** — FR-003.

- `shared/utils/date.ts:64-68` — `toLocalDayKey` uses `getFullYear/getMonth/getDate`.
  Its own doc comment is explicit that it reads "in the viewer's timezone", and argues
  that is correct because the values are "stored as church-local wall clock in
  `timestamptz`". That premise is the thing #128 has to adjudicate: the value is an
  instant, and the viewer's zone is not the church's.
- `features/scheduling/components/participation-tailoring.utils.ts:341-347` —
  `toIsoDateString(date)` via `getFullYear/getMonth/getDate`.
- `participation-tailoring.utils.ts:171-178` — `toLocalDateTimeValue`, the inverse of
  Class 2's `toIsoString`; round-trips an instant through the browser's wall clock.
- `participation-tailoring.utils.ts:413` — `localTimeOfDayInMinutes` via
  `getHours()*60 + getMinutes()`, used for the time-window filter. A leader filtering
  "events after 18:00" filters in their own zone, not the church's.
- `planning-admin.utils.ts:186,190,349` — `date.slice(0, 10)`, and
  `` `${date.slice(0,10)} ${date.slice(11,16)}Z` `` which renders a raw **UTC** wall
  clock with a literal `Z` suffix to the user.
- `utils/format-last-served.ts:30` — `differenceInCalendarDays(new Date(), served)`,
  calendar days counted in the browser's zone.

`shared/utils/date.ts:71-79` `toCycleDayKey` (`value.slice(0,10)`) is the deliberate
counterpart for date-only values and is **correct for what it handles** — see Class 9.

## Class 6 — Display formatting in the browser's zone

**Population: 26 call sites across 14 files.** Constructs: a **rendered string**.
Resolves in: **browser**. Verdict: **wrong** — FR-003, and FR-007 where a volunteer
sees a time with no timezone indicator at all.

Leader surfaces:
- `scheduling/utils/builder/cycle-builder-date.utils.ts:12,18,189` — `toLocaleDateString`,
  `toLocaleTimeString`, `Intl.DateTimeFormat` for weekday names
- `scheduling/components/builder/cycle-builder-header.tsx:26-31`
- `scheduling/components/builder/audit-log-panel.tsx`
- `scheduling/components/tailoring/tailoring-calendar.tsx:30,42-44`
- `participation-tailoring.utils.ts:60-87` — `formatDate`, `formatDateTime`, `formatTimeRange`

Volunteer surfaces (no timezone indicator anywhere):
- `volunteers/lib/assignment-grouping.ts:18-20` — `toLocaleString()`, no options
- `volunteers/lib/dashboard-mappers.ts:101-102` — `toLocaleString()`
- `volunteers/components/availability-form.tsx:70-72` — `toLocaleString()`/`toLocaleTimeString()`
- `volunteers/components/availability-check-detail.tsx` (6 sites)
- `volunteers/components/ministry-schedule-section.tsx`,
  `upcoming-assignments-section.tsx`, `dashboard-offline-banner.tsx`,
  `volunteers/hooks/use-notification-inbox.ts`

Bare `toLocaleString()` with no `options` is also the site class most exposed to the
**24h decision**: it emits whatever the OS locale says, which is the same failure mode
#130 found in `<input type="time">`.

## Class 7 — Native time inputs

**Population: 4 inputs, 2 files.** Constructs: a **wall-clock time of day** (`HH:mm`).
Resolves in: **none** (a bare time of day), but **renders** in browser/OS locale.
Verdict: **violates the locked 24h decision today** (per #130).

- `scheduling/components/planning-admin/template-block-row.tsx:69,86`
- `scheduling/components/tailoring/tailoring-filters.tsx:88,104`

There is no time-picker component in the repo. These four are the whole population #133
has to replace.

## Class 8 — The date picker

**Population: 1 component, 7 date calls.** Constructs: a **calendar day**, `yyyy-MM-dd`.
Resolves in: **none**. Verdict: **correct**.

`components/date-picker-field.tsx` is worth calling out because the ticket listed it as
a suspect and it comes back clean. It parses and formats `yyyy-MM-dd` with date-fns
`parse`/`format`, using a browser-local `Date` purely as a carrier that never escapes
the component. `components/ui/calendar.tsx` (react-day-picker + `date-fns/locale`) is
likewise day-only.

The lesson for the seam: *a browser-local `Date` is not automatically a bug.* It is a
bug when it crosses the day↔instant boundary. That boundary is the seam.

## Class 9 — Persistence

**Population: ~75 columns.** Verdict: **004's SC-001 is false as written, and the
schema is arguably more right than the spec.**

- **71 columns** are `timestamp(..., { withTimezone: true, mode: 'date' })` — correct
  under FR-001.
- **4 columns are not timezone-aware**, all in `packages/db/src/schema/planning.ts`:
  - `planning_cycle.start_date` / `end_date` — `date('start_date', { mode: 'date' })` (L52-53)
  - `time_block.start_time` / `end_time` — `time('start_time')` (L112-113)

SC-001 says "100% of date/time columns use timezone-aware storage". These four fail it.
But a planning cycle **is** a range of calendar days, and a time block **is** a wall
clock time of day — neither is an instant, and forcing them into `timestamptz` would be
the actual modelling error. `scheduling.ts:74-80,111-117` stores `time_slot` and `shift`
bounds as `timestamptz`, correctly, because those **are** instants.

**The database already draws the distinction #128 is about to name.** It is the only
layer that draws it consistently. SC-001 should be amended, not the schema.

## Class 10 — "Now", with no injectable clock

**Population: 65 production calls in 31 server files, 7 in web.** Constructs: an
**instant**. Resolves in: **process/browser clock**. Verdict: **not wrong under 004**,
but it is the enforcement problem.

A `Clock` interface exists — at `apps/server/src/test-support/clock.ts:3`, with
`FixedClock`. **It is test-support only; no production code depends on it.** Production
reaches for `new Date()` directly in every domain entity
(`assignment.ts`, `event.ts`, `volunteer.ts`, `planning-cycle.ts`, `shift.ts`,
`time-slot.ts`, `ministry*.ts`, `availability-check.ts`, `volunteer-notification.ts`,
`slot-requirement.ts`, `assignment-audit.ts`), every repository
(11 `drizzle-*.repository.ts` files), and 7 application managers. Drizzle's
`$onUpdate(() => new Date())` accounts for ~15 more in `packages/db/src/schema/`.

Web: `use-volunteer-dashboard.ts:60`, `use-cycle-builder.ts:394`,
`format-last-served.ts:30`, `date-picker-field.tsx:15,55,59,60`.

This is the number that decides whether "the seam" can be enforced by a lint rule
banning `new Date()`. **Today such a rule would fire 72 times.** Any enforcement
mechanism has to either migrate all 72 or scope itself narrower than "no `new Date()`".

## Class 11 — API boundary

**Population: ~20 DTO fields.** Verdict: **mostly correct, one gap.**

- `event.dto.ts:10-11`, `time-slot.dto.ts:6-13,28-29`, `participation.dto.ts:71-92` —
  `z.string().datetime()`, ISO 8601 with `Z`. Correct under FR-005.
- `planning-cycle.dto.ts:9-10` — `z.string().date()`, and the mapper at L49-50 emits
  `cycle.startDate.toISOString().slice(0, 10)`. Correct **as a calendar day**, and the
  boundary type (`.date()` vs `.datetime()`) makes the distinction explicit. This is a
  second layer that already names what #128 wants named.
- `event-template.dto.ts:6-7` — `z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/)` for time
  blocks: a wall-clock time of day, validated by shape. Also correct.
- The gap: `event-template.dto.ts:26-27,38` and `planning-cycle.dto.ts:21-25` type the
  **response** side as bare `z.string()`, discarding the distinction the request side
  encodes. The generated client therefore hands the web app `string` with no hint
  whether it is a day, a time, or an instant — which is precisely how Class 5's
  `toLocalDayKey`/`toCycleDayKey` ambiguity arose.

---

## What this changes for the open tickets

**#128 (name the calendar-day vs instant distinction)** — the distinction is already
drawn, independently and inconsistently, in **three** places: the DB (`date`/`time` vs
`timestamptz`), the request DTOs (`z.string().date()` vs `.datetime()`), and web's
`toCycleDayKey` vs `toLocalDayKey`. Web's version is the only one that gets it wrong,
and it gets it wrong because the response DTOs erase the distinction before it arrives.
There are **three** kinds here, not two: calendar day, time of day, and instant. Class 7
and Class 9's `time_block` are the third.

**#129 (how the church timezone reaches the client)** — server-side plumbing already
exists and works (Class 1). The client end is a single hardcoded string in `main.tsx:17`
and a provider that is wired to only four components (Class 4). The question is smaller
than it looked; the *blast radius of fixing it* is Class 6's 26 sites, which is larger.

**#131 (the seam and its enforcement)** — the enforcement question has a hard number now:
a naive `new Date()` ban fires **72 times**, and Class 8 proves some of those are
legitimate. The seam has to be defined by the day↔instant crossing, not by the
constructor. Note also that a `Clock` abstraction already exists in test-support and
could be promoted rather than invented.

**#132 (time format config)** — Class 6's bare `toLocaleString()` calls (at least 8) are
a second 24h violation beyond Class 7's inputs. The config seam has to cover display,
not just input.

**#133 (time-entry direction)** — the replacement population is exactly 4 inputs in
2 files. Small.

**Fog: "server- and db-layer audit"** can be closed by this document. The server write
path is correct (Class 1); the DB is correct modulo SC-001's wording (Class 9); the
server's exposure is Class 10 (`new Date()`) and Class 11 (response DTO erasure), both
of which are enforcement/typing concerns rather than timezone bugs. **The seam's centre
of gravity is `apps/web`.**

**Fog: "repair of already-corrupted rows"** — the corrupting writers are the 3 sites in
Class 2, all reachable only from the quick-create modal and the tailoring/planning-admin
manual-span editors. Scoping a repair means scoping those three writers' output, not the
whole `event` table.
