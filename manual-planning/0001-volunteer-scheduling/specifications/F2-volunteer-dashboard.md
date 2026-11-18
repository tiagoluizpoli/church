# Spec F2: Volunteer Dashboard (Mobile/PWA)

> **⚠️ Partially superseded (2026-07-06) — Spec 018: Church-wide UX/IA Redesign.** §1.1/1.2 and §2.3's `Notifications Inbox` as a dashboard section is replaced by a single top-bar notification bell (present for every role, not dashboard-scoped) with its own full-history route — the dashboard itself no longer renders a notifications section at all. The remaining three sections (`Availability Needed`, `My Upcoming Assignments`, `Ministry Schedule`) keep their relative priority/order from §1.2 but move from a flat vertical stack into switchable tabs on the same route. Everything else in this spec (availability model, assignment-response rules, notification *content*/deep-linking semantics in §5, PWA/offline behavior) is unaffected — only where notifications are *displayed* changes, not how they're generated or what they say. Authoritative source: [`specs/018-churchwide-ux-redesign/spec.md`](../../../specs/018-churchwide-ux-redesign/spec.md).

## Purpose
Define the volunteer-facing, mobile-first dashboard for availability submission, assignment visibility, response workflows, notifications, and read-only ministry schedule transparency.

This dashboard is the canonical volunteer entry point. Legacy single-purpose routes such as standalone availability pages should fold into this experience rather than competing with it.

---

## 1. Product Shape

### 1.1 Dashboard Sections

- **Availability Needed**: A high-priority task section listing Events where the volunteer still owes availability input.
- **My Upcoming Assignments**: The volunteer's own published Assignments across all Ministries, grouped by Event.
- **Notifications Inbox**: Historical scheduling notifications with read/unread state.
- **Ministry Schedule**: A read-only schedule browser for one selected Ministry at a time.

### 1.2 Priority Order

1. Availability Needed
2. My Upcoming Assignments
3. Notifications Inbox
4. Ministry Schedule

---

## 2. Core Views

### 2.1 Availability Needed

- Shown as a dedicated task section when at least one upcoming Event is missing complete availability coverage.
- Appears above `My Upcoming Assignments`.
- Each task opens directly into the availability form for that specific Event.
- The task remains visible until the volunteer has answered every relevant Event slot.
- The task is intentionally not dismissible or snoozable in MVP.
- Reminder-related UI may be intentionally noisy and may be emphasized in more than one place.

### 2.2 My Upcoming Assignments

- Shows only published Assignments.
- Combines the volunteer's Assignments across all Ministries into a single dashboard surface.
- Includes future Assignments plus Assignments currently in progress.
- Removes cancelled or removed Assignments immediately from this section.
- Groups items by Event rather than showing one flat global list.
- Sorts Event groups by the earliest Assignment time they contain.
- Auto-expands the first Event group that still contains an actionable assignment state.
- Event groups reset their expanded/collapsed state on each new visit.
- Each collapsed Event header shows:
  - Event title
  - Ministry name
  - Next Assignment time
  - Aggregate response state
- Expanded Event groups show only the volunteer's own Assignments, not the broader Ministry schedule.
- In-progress Assignments:
  - remain visible until the TimeSlot ends
  - appear before future Assignments inside the Event group
  - show a visible `Now` / `In Progress` badge
  - have response controls disabled once the Assignment is already in progress

### 2.3 Notifications Inbox

- Is a real historical scheduling inbox, not a lightweight transient feed.
- Aggregates notifications across all Ministries the volunteer belongs to.
- Stores read/unread state.
- Supports `mark all as read`.
- Does not support notification deletion in MVP.
- Uses a single chronological list with date buckets such as `Today`, `Yesterday`, and `Earlier`.
- Retains notifications indefinitely in MVP.
- Loads older notifications progressively from newest to oldest via a `Load more` interaction.
- Shows a strong but clean unread visual treatment.
- Stores and displays scheduling-related alerts only in MVP.
- Each list item shows:
  - a meaningful summary in the list
  - deeper details on tap
  - inline emphasis for reminder notifications
- If multiple notifications relate to the same Assignment, they remain separate records but should be visually related when useful.

### 2.4 Ministry Schedule

- Is a secondary section or tab, not the first priority dashboard surface.
- Shows the full published schedule for one selected Ministry at a time.
- Uses the volunteer's next upcoming Assignment Ministry as the default if multiple Ministries exist.
- Allows manual Ministry switching when the volunteer belongs to multiple Ministries.
- Hides the selector entirely when the volunteer belongs to only one Ministry.
- Shows current and upcoming published Events only.
- Orders Events by nearest upcoming first.
- Starts Events collapsed by default.
- Each collapsed Event header shows:
  - Event title
  - Date/time range
  - Assignment count
- Inside each Event:
  - order Assignments by TimeSlot first, then Role
  - show the full Ministry across all Teams
  - show Team labels whenever a Team exists
  - show volunteer names as `first name + last initial`
  - show confirmation state inline on each Assignment
  - do not show leader-only conflict, override, or audit details
- If the selected Ministry has no current or upcoming published Events, show an explicit empty state.

---

## 3. Availability Model

### Refinement Note — 2026-06-29

The original F2 draft assumed volunteer-authored time/day spans. That model was useful for early exploration, but dashboard implementation and product review clarified a better MVP direction:

- leaders define the concrete service slots
- volunteers answer those slots with simple availability choices
- completion means every relevant slot has an answer, not that the volunteer manually covered an Event span

This is an additive refinement, not a scope expansion. Event-scoped ownership still matters, but the volunteer interaction is now slot-answer-driven because it better matches the real church scheduling workflow and reduces accidental complexity in the volunteer UX.

### 3.1 Scope

- Availability is entered per Event, not as one global reusable calendar.
- Volunteers may edit previously submitted availability until the Event starts.

### 3.2 Granularity

- **Hourly Events**: Leaders define one or more service slots and volunteers answer each slot with a simple availability choice.
  - Example: `8:00 AM = available`, `10:30 AM = unavailable`, `6:30 PM = available`
- **Day-Based Events**: Leaders still define the relevant service blocks for the retreat / special event, and volunteers answer those blocks rather than typing free-form spans.

### 3.3 Completion Rule

- Availability counts as complete only when the volunteer has answered every relevant Event slot.
- Partial input means one or more leader-defined slots are still unanswered.
- MVP keeps the task language simple rather than showing complicated remaining-span counts.

### 3.4 Save Behavior

- Availability uses an explicit `Save` action rather than auto-save.
- Successful saves show an explicit temporary success confirmation.

### 3.5 Published Assignment Overlap Warning

- If a volunteer marks themselves unavailable for a span that overlaps a published Assignment:
  - the app must warn clearly before saving
  - the warning must explicitly explain that this may leave the Event understaffed or require leader reassignment
  - the volunteer may still proceed and save after explicit confirmation
- The ability to allow this save should be treated as a feature-flag-friendly decision during rollout, with a path to a stronger long-term configuration later.

---

## 4. Assignment Responses

### Refinement Note — 2026-06-29

The original response model emphasized `confirm / decline`. After implementation review, we refined the intended volunteer flow:

- availability submission is the primary pre-schedule commitment
- once a leader publishes the schedule, a confirmed assignment is already understood as scheduled
- the most important volunteer-side follow-up action is `I cannot serve`, not redundant re-confirmation

Pending assignments may still temporarily preserve a confirm path where older data or transitional states exist, but the intended steady-state UX is "scheduled unless the volunteer flags a problem."

- Responses happen per Assignment, never as one bulk Event-level action in MVP.
- Response controls live inside expanded Assignment rows, not collapsed Event headers.
- The volunteer may only act on their own Assignments.
- A scheduled volunteer may change a previously confirmed Assignment to unable-to-serve before the Event starts; this is treated as a fresh decline event.
- The destructive `I cannot serve` path must include a strong confirmation safeguard to avoid accidental taps.
- Decline reason is removed from MVP. A lightweight unable-to-serve signal is the core post-publication volunteer action.

---

## 5. Notifications & Change Awareness

### 5.1 Scheduling Notification Types

- Schedule published
- Assignment added
- Assignment moved or otherwise changed
- Assignment removed
- Availability reminder
- Other volunteer-scheduling notifications explicitly tied to published schedule state

### 5.2 Content Style

- Notifications about Assignment changes should say specifically what changed.
- Removal notifications should say clearly that the volunteer was removed.
- If the same Assignment changes multiple times, each change remains a separate notification.

### 5.3 Deep Linking

- Notification taps should deep-link to the most relevant dashboard context.
- If the exact target no longer exists:
  - redirect to the most relevant surviving section
  - explain that the original content changed or is no longer available
  - use a temporary toast with a helpful action when relevant

### 5.4 Source of Truth

- The live dashboard is always the source of truth.
- Notifications are historical records and may no longer match the latest live state.

---

## 6. PWA / Mobile Behavior

### 6.1 Push Notifications

- Push notifications remain the primary MVP notification channel.
- Push permission should be requested only after the volunteer has seen real scheduling value.
- Good trigger examples:
  - after loading `My Upcoming Assignments`
  - after opening `Notifications Inbox`
- Do not prompt on first app open.

### 6.2 Add to Home Screen

- `Add to Home Screen` should be exposed passively in MVP.
- Do not force an automatic install prompt by default.

### 6.3 Offline Reading

The following sections should remain readable offline from cached last-known data:

- `Availability Needed` context where feasible
- `My Upcoming Assignments`
- `Notifications Inbox`
- `Ministry Schedule`

### 6.4 Offline Messaging

- Show one dashboard-level offline / cached-data banner.
- Show stale-data messaging when cached data may be outdated.
- Cached response state may still be shown offline, but should carry stale-data framing.
- If the volunteer manually refreshes while offline, keep cached data on screen and show a clear failure message.

### 6.5 Offline Writes

- Confirm/decline actions require a live connection in MVP.
- Availability edits require a live connection in MVP.
- Do not queue volunteer writes offline in MVP.

---

## 7. Refresh & Background Data Policy

- Manual refresh refreshes the whole dashboard together.
- Automatic reconnect behavior should refetch data when connectivity returns.
- Background online refresh should exist on a conservative cadence.
- Routine background refresh should stay visually silent when nothing changed.
- If a background refresh results in real data changes, the app should provide a subtle visible indication that the dashboard updated in the background.

---

## 8. Empty-State Rules

- If there are no upcoming Assignments, explicitly reassure the volunteer that they are not currently scheduled.
- Empty states should still guide the volunteer toward next useful actions such as Availability or Ministry Schedule.
- `Ministry Schedule` and other sections with no relevant data should show explicit empty states rather than silently vanishing when that would create confusion.

---

## 9. Testing Requirements (Mandatory)

- **Component**: Confirm button updates Assignment response state correctly.
- **Component**: In-progress Assignments display a visible state badge and disabled response controls.
- **Component**: Availability overlap warning requires explicit confirmation before continuing.
- **Component**: Notifications display unread styling, date grouping, and reminder emphasis correctly.
- **Integration**: Volunteer cannot respond to another volunteer's Assignment.
- **Integration**: Volunteer can change a previously confirmed Assignment to declined before Event start.
- **Integration**: Availability saves can surface published-assignment overlap warnings without silently blocking the save.
- **Integration**: Inbox stores scheduling notifications with read/unread state and cross-Ministry ownership protection.
- **Integration**: Ministry Schedule exposes only published schedule visibility and hides leader-only audit/conflict details.
- **Accessibility**: All interactive controls meet mobile target sizes of at least 44x44px.
- **Offline**: Cached dashboard sections remain readable without network, and stale-data messaging appears correctly.

---

## 🔗 References

- [Spec 03: Assignments & Availability](./03-assignments-availability.md)
- [Spec 10: Scheduling API](./10-scheduling-api.md)
- [Spec 11: Notifications & Alerts](./11-notifications.md)
- [Backlog Index](../backlog/index.md)

## 🔴 Mandatory UI Component Rule

Everything must be built exclusively using standard **shadcn/ui** components. Do not build custom UI elements from scratch. Make as few modifications as possible. If a component is missing, pause and ask the user to find a community implementation.
