# Research: Today's app surfaces the Kids journeys touch

Issue: #1089 (map #1072). Inventoried 2026-11-24 against `develop` @ `bc9f6c75`, not this branch (which is 76 commits behind).
Status: research only. Paths are repository-relative; web paths are under `apps/web/src/` unless given in full.

## 0. Summary

The app today is a volunteer-scheduling product. Nearly every Kids concept is new, but most of them hang off something that exists:

- **Already there and reused:** Church Membership on Better Auth's `member`, Sector/Shift/ShiftRequirement/Assignment with real start and end times (so "running Shift" and "open Room" can be computed), the outbox + `Notifier` with an inbox sink and an email sink, the bell, the Public Church Profile at `/$slug`, the `AuthorityService` gatekeeper (ADR 0009), `WorkspacePage` + `WorkspaceIntroPanel` + `DataTable`, the responsive dialog/drawer, the PWA service worker, and an untyped `church.settings` jsonb.
- **Missing, and the journeys depend on it:** public sign-up (disabled), Google sign-in, a phone on a person (there is no Person table), any profile/account page, any nav or Home content for a member with no Ministry, web push, realtime, background jobs other than the outbox poller, QR generation, camera scanning, printing, and any typed home for behaviour settings.
- **Biggest shape change:** today a plain Church Member sees a Home with an unread line and a welcome sentence, and nothing else. Guardians are mostly plain members, so the Guardian journey runs through screens that don't exist yet.

## 1. What a person can reach today

### Unauthenticated
| Route | What it is |
|---|---|
| `/` | redirect: `/login` or `/app` |
| `/login`, `/forgot-password`, `/reset-password` | email + password only (`components/sign-in-form.tsx:41`); reset by emailed link |
| `/$slug` | **Public Church Profile** (`routes/$slug.tsx:12`): programme, events, addresses, contacts, legal. No join or sign-up action. Server: `GET /public/churches/:slug`, `/:slug/page` (server-rendered HTML), `/:slug/events`, rate-limited |
| `/invitations/church/$invitationId` | the **only way in**: review the Church Invitation, get a 6-digit emailed code, enter code + name + password. `components/sign-up-form.tsx` exists but nothing uses it |

### Signed in, no active Church
`/app/select-church`, `/app/switch-church-confirm`, `/app/no-access` (no membership), `/app/invitations/church/$invitationId/review` (existing user accepts), `/app/invitations/ministry/$invitationId` (accept/decline, Volunteer Transfer).

### Inside the active Church (`routes/app/_active-church.tsx`)
| Route | Shows | Reached by |
|---|---|---|
| `/app` | Home (widget registry) | everyone |
| `/app/notifications` | inbox + detail sheet | everyone |
| `/app/my-schedule[/$assignmentId, /$ministryId/$cycleId]` | own Shifts, Assignment detail, swap request | Volunteer (nav only) |
| `/app/availability[/$checkId]` | Availability Checks | Volunteer (nav only) |
| `/app/schedules/...` (`_prepare`, `slots`, `assign`) | prepare, assign, publish | ChurchAdmin or Ministry leader |
| `/app/cycles...`, `/app/event-templates...` | Cycle builder, Events, templates | ChurchAdmin (`_planning-admin.tsx:9`) |
| `/app/ministries[/$ministryId/{operational,usual-setup,settings}]` | Ministry workspace: Structure (Sectors + Roles), Usual setup, Settings (ChurchAdmin) | ChurchAdmin or leader (`CapabilityGate`) |
| `/app/people[/$memberId]` | people directory, member detail | ChurchAdmin or leader |
| `/app/invitations` | sent invitations, invite dialog | ChurchAdmin or leader |
| `/app/church-settings` | identity, logo, address, contacts, social, legal | ChurchAdmin |

Route guards are one of: `_planning-admin` `beforeLoad` (403 → `/app`), an in-page `CapabilityGate`, or nothing (server enforces).

## 2. Navigation and Home

- One nav list: `NAV_ENTRIES` in `components/app-shell.tsx:117`, each item with `isVisible(capabilities)`, grouped `home | serving | scheduling | church` (`:190`).
- Capabilities come from `useCallerCapabilities()` (`shared/hooks/use-caller-capabilities.ts`) over a server endpoint: `isChurchAdmin`, `leadsMinistries`, `hasVolunteerMembership`, `ledMinistryIds`. All false while loading.
- What each role sees: everyone Home; Volunteer + Serving (My schedule, Availability); leader + Schedules, Ministries, People, Invitations; ChurchAdmin + Cycles, Event templates, Church settings.
- Layout: collapsible sidebar on desktop; on mobile a hamburger `MobileDrawer` with the same list, switch-church, theme, account. **No bottom nav.** Header: breadcrumbs, command palette, bell, `UserMenu` (initials, name, email, sign out; nothing editable).
- Home (`features/home/components/home-page.tsx`) composes widgets from `home-widget-registry.tsx`, each with a capacity rule (church = admin, leadership = admin or leader, serving = volunteer). A plain member gets only the unread-notifications widget and `PlainWelcome` (`home-page.tsx:66`). A new widget is one registry entry + a capacity rule.

### Where Kids would live (reading of the shape, not a decision)
| Role | Natural place | What has to be added |
|---|---|---|
| Guardian (often a plain member, or a member of another Church with only a Family Link here) | a new top-level item + a Home widget ("Cadastre seus filhos", current Check-in, Pickup code) | a capability such as "has a Family" / "Guardian of an open Check-in here", served by the capability endpoint; a Guardian with only a Family Link has no `member` row here today, so the active-Church model does not fit them (see 4.1) |
| Volunteer on a Room's Shift | the Serving group (next to My schedule), plus the Assignment detail | a "my Room now" capability derived from a running Shift |
| Kids leader | the Ministry workspace (a Rooms tab beside Structure) for setup; a live view for service day | Room attributes on Sector; a live roster/anomaly view that has no precedent |
| ChurchAdmin | Church settings (check-in settings, Church sign-up link + poster) | a typed settings section |

## 3. Domain facts the journeys lean on

- **No Person table.** A Person is Better Auth's `user` (id, name, email unique, emailVerified, image) in `packages/db/src/schema/auth.ts`. One User per Person holds trivially. **No phone on people**; phones exist only on `church_contact` (E.164).
- **Church** = Better Auth `organization` + `church` row (timezone, `settings` jsonb `{}`, logo…). **Church Membership** = `member` (`member|admin`, `lastOpenedAt`). Active Church = session `activeOrganizationId`; every domain table has `church_id`.
- **Better Auth** (`packages/auth/src/index.ts`): email+password only, `/sign-up/email` disabled (`:63`), organization plugin with `allowUserToCreateOrganization: false`.
- **Joining** (`packages/db/src/schema/onboarding.ts`, `apps/server/src/application/db-redemption-manager.ts`): Church Invitation → `invitation_verification_code` → `RedemptionBundle` (ADR 0011) → membership + ministry grants. Routes under `/redemption`.
- **Authorization** (ADR 0009): `AuthorityService` (`apps/server/src/domain/authority/authority-service.ts`) over actions `manage | participate | access` and resources church, ministry, invitation, ministryMembership; facts from `drizzle-authority-actor-resolver.ts`. Ministry Access Level `volunteer | leader`. Role is a qualification, never a permission. 401/403/404 conventions.
- **Schedule:** Cycle (date range) → Event (`start`/`end` timestamptz; CONTEXT.md avoids the word "service" — an Event, or one EventTimeBlock in it, is the occurrence) → EventTimeBlock (`start_time`/`end_time`, status) → MinistryParticipation (preparing → published) → Shift (`start_time`/`end_time`) → ShiftRequirement (role, **sectorId**, peopleNeeded) → Assignment (draft/pending/confirmed/cancelled, `assignment_audit`). "Running now" is computable (start ≤ now < end); no helper exists yet.
- **Sector** = churchId, ministryId, name, archivedAt. Nothing else. UI (`SectorRegistry`) lists, adds, renames, archives.
- **Notifications** (ADR 0008): change → `outbox_message` per recipient in the same transaction (`church-notifications.ts`, `church-recipients.ts`) → `db-outbox-drainer.ts` → `Notifier` (`notifier.ts`) → sinks `inbox-notification-sink.ts` and `email-notification-sink.ts`. **Recipients are checked against Church Membership at delivery.** `notification` rows: kind, data jsonb, readAt. Message text built at read time (`apps/web/src/lib/notification-render.ts`). The web polls every 2 minutes (`packages/app-config/src/index.ts:151`).
- **Jobs / realtime:** only the in-process `OutboxPoller` (`setInterval`, retries, `scheduledFor`). No cron, no queue, no SSE or websocket.
- **Rate limit:** in-memory per-instance sliding window (`apps/server/src/api/utils/rate-limit.ts`, a `shortcut:`), used by redemption and the public profile.
- **Audit:** `assignment_audit`, `identity_audit`, `security_log`, `event_time_block_move`. No generic audit log.
- **Settings:** `ChurchSettings` (`apps/server/src/domain/church-settings.ts`) is identity/contacts only, ChurchAdmin-only. `church.settings` jsonb exists, untyped, with no reader.
- **PWA:** `vite-plugin-pwa` (`apps/web/vite.config.ts:19`), Workbox SW, `start_url: /app`; manifest still named `base-fullstack-template`. No PushManager, VAPID or subscription table.
- **UI patterns:** `components/workspace-page.tsx` (`WorkspacePage`, `WorkspaceIntroPanel`), `components/ui/data-table.tsx:118` (table on desktop, cards on mobile; the list-page standard), `responsive-form-surface.tsx` (dialog ↔ bottom drawer at `md`), sheets, `CapabilityGate`, `coming-soon-page.tsx`. Strings in `packages/i18n/messages/pt-BR.json` / `en.json` (Paraglide), hard-coded text is a lint error.
- **Not present anywhere:** QR generation, camera/barcode scanning, print code, image upload other than the Church logo crop.

## 4. What each decision changes

### 4.1 [Family model](https://github.com/tiagoluizpoli/church/issues/1079) (ADR 0017)
- **New:** Family, Child, Guardian, Guardian contact, Family Link, join request, consent records, Care notes. All new tables; none exist.
- **Changes the tenancy assumption.** Families are platform-level, not `church_id` rows. A Church sees a Family only through a Family Link, and a Guardian may hold a Family Link to a Church **without a `member` row there**. Today every `/app` page requires an active Church the user is a member of (`_active-church.tsx`, `DbActiveChurchResolver`). Either a Family-Linked non-member gets a narrower active-Church mode, or Kids pages for Guardians sit outside `_active-church`. This is the main structural question for the Guardian journey.
- **Authorization:** `AuthorityService` has no Family or Child resource; "Guardian of this Family" and "linked Church" are new facts.
- **New surfaces:** Family page (Children, Guardians, invite, leave), Child form with consent toggles, join-request approval (needs a notification kind).

### 4.2 [Check-in and check-out flow](https://github.com/tiagoluizpoli/church/issues/1080) (as amended by Rooms)
- **New:** Check-in, Check-in point (+ its QR), Pickup code, Authorised adult, Pickup restriction, Release override, unclosed Check-in. No precedent tables.
- **Needs capabilities that don't exist:** QR generation (Check-in point poster, Pickup code, Child tag QR), camera scanning (Check-in point, Pickup code; see `mobile-qr-scanning.md`), tag rendering (screen/PDF until the printing module).
- **Room roster** is the first live, minute-by-minute screen in the app; today everything polls at 2 min and nothing pushes changes. The door's check-out view needs Guardian photos, and the only image upload today is the logo crop.
- **Unclosed Check-in alert** needs a job that fires when a Shift ends: the outbox `scheduledFor` is the only scheduling primitive.
- **Audit:** release override, restriction, Authorised adult changes need their own audit (no generic log).

### 4.3 [Rooms, Events and Kids Ministry](https://github.com/tiagoluizpoli/church/issues/1081)
- **Sector** gains "is a Room" and Room settings (lead time, age range, max Children, Children per volunteer); **Ministry** gains "check-in on". Today Sector is name-only; the Structure tab (`SectorRegistry`) is where these would be edited.
- **Room open** = a Shift of the Ministry with a ShiftRequirement at the Sector, from lead time before the first Shift to the end of the last one in that EventTimeBlock: computable from existing columns; a manual open needs a new record.
- **Check-in belongs to one EventTimeBlock**; Call numbers are per EventTimeBlock.
- **Room placement** and **Move** are new records with history.
- **Assignment freeze exception:** a Kids leader editing a running Shift. Today Assignments live in the prepare/assign/publish flow (`/app/schedules/...`) with `assignment_audit`; a live add/remove on service day is a new path into the same Assignment, recorded.
- **Room's people** (current Assignments at that Sector + Kids leaders) is a new derived authority fact; today authority knows Ministry Access Level only, not "assigned to this Sector now".
- **Awaiting drop-off** expiry (drop-off window) is another timed job.

### 4.4 [Paging → Calls](https://github.com/tiagoluizpoli/church/issues/1082) (ADR 0018, amends ADR 0008)
- **Notifier** gains a **web push sink** next to inbox and email; needs a push subscription table, VAPID keys, and service worker push handling (the Workbox SW exists, push does not). See `web-push-paging.md`.
- **Recipient rule changes:** delivery today checks Church Membership; Calls check "Guardian of an open Check-in at this Church" (ADR 0018). A Family-Linked non-member must still get the Call and see it in the bell, so the inbox (`church_id`-scoped, membership-checked) needs the same exception.
- **Latency:** the outbox drain tick and the 2-min web poll are too slow for a Call's in-page alert and the 2-min "unanswered after" clock. Needs a faster path (push wake, a short poll while a Call is open, or realtime).
- **New:** Call, Call number, Notice, typed responses, Call audit trail, call preference and Notice preference per Guardian (no preferences UI exists anywhere today), new notification kinds rendered in `notification-render.ts`.
- **Unanswered after** and **drop-off window** become the first typed check-in settings.

### 4.5 [Onboarding](https://github.com/tiagoluizpoli/church/issues/1083)
- **Re-enables sign-up** that is disabled today (`/sign-up/email` in `disabledPaths`), but only through a Church: new Church sign-up link page (and printable QR/poster), "Cadastre-se" on `/$slug`, sign-up entry from a Check-in point QR, "Criar conta" on `/login` opening a find-your-Church search (no endpoint lists Churches publicly today; the public API is by slug only).
- **Google sign-in:** add Better Auth `socialProviders.google`; today none configured. See `google-signin-registration.md`.
- **Email code at sign-up:** the 6-digit code exists only for Church Invitations (`invitation_verification_code`); sign-up needs its own.
- **Phone mandatory:** no phone column on `user`; needs one (or a profile table), plus the marketing opt-in record.
- **Signing up = joining:** creates `member` at `member` without a Church Invitation, a second path beside `RedemptionBundle`.
- **Leave / Remove** as app operations (today no leave exists; Better Auth org routes are the gap in #1088, still open, a prerequisite).
- **Profile/account page:** none exists; needed for phone, photo (pickup), memberships and leaving.
- **Visitor desk path:** Guardian contact, 30-day deletion job (another timed job), claim code QR on the Guardian tag, claim replacing the contact in the Family.
- **Family invitation:** a new single-use link + share sheet; unrelated to Church/Ministry invitations.
- **Promotion:** a Home widget "Cadastre seus filhos" for members with no Family (the widget registry fits), Church sign-up link + poster in Church settings.

### 4.6 [Tag layout prototype](https://github.com/tiagoluizpoli/church/issues/1084)
- Deferred to the printing module. Before it, tags render to screen/PDF; no render or print code exists, and Material Symbols are not in the web app today.

### 4.7 Research tickets
- [Web push](https://github.com/tiagoluizpoli/church/issues/1073): matches 4.4; iOS needs Home Screen install, so the PWA manifest (still the template name) and an install-coaching screen become real work.
- [Silent printing](https://github.com/tiagoluizpoli/church/issues/1074) / [phone-scan printing](https://github.com/tiagoluizpoli/church/issues/1086): nothing in the app; the printing module adds an on-site agent the server must reach, which has no precedent (no realtime, no device registry).
- [QR scanning](https://github.com/tiagoluizpoli/church/issues/1075): nothing in the app; HTTPS is already the deploy norm.
- [LGPD](https://github.com/tiagoluizpoli/church/issues/1076): consent records, retention/deletion jobs and export have no precedent; ADR 0014 (observability sends ids, never personal data) already fits children's data.
- [Google sign-in](https://github.com/tiagoluizpoli/church/issues/1077): matches 4.5.

## 5. Cross-cutting gaps (each one shows up in more than one journey)

1. **A Guardian who is not a member of the Church** (Family Link only) has no place in the `_active-church` model, the capability endpoint, or the membership-checked inbox.
2. **Plain-member surfaces**: no profile page, no nav beyond Home, no preferences.
3. **Time-driven work**: unclosed Check-in, Awaiting drop-off expiry, Unanswered Call, 30-day desk record deletion; only the outbox `scheduledFor` exists.
4. **Freshness**: roster, Calls and anomalies need seconds, the app has 2-minute polling and no realtime.
5. **Typed Church check-in settings**: `church.settings` jsonb is unused and untyped.
6. **Device features**: QR generation, camera scanning, photo upload of people, tag rendering.
7. **Rate limits** are per instance in memory, fine for one instance; a Sunday burst on several instances is in the map's fog.
