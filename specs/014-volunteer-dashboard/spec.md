# Feature Specification: Volunteer Dashboard

**Feature Branch**: `014-volunteer-dashboard`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "Create the next specification from the volunteer scheduling specification list for the volunteer dashboard, using the connected manual-planning files that were just updated during the grilling session."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit Availability For An Event (Priority: P1)

A volunteer opens the dashboard, sees that an upcoming Event still needs availability, enters their availability for that specific Event, and saves it successfully.

**Why this priority**: Without reliable volunteer availability, leaders cannot build trustworthy schedules and reminder flows lose their purpose.

**Independent Test**: A volunteer with no recorded availability for an upcoming Event can open the dashboard, enter availability matching the Event type, save it, and see the task update from incomplete to complete.

**Acceptance Scenarios**:

1. **Given** a volunteer has an upcoming hourly Event with missing availability, **When** they open the dashboard, **Then** the dashboard shows an `Availability needed` task for that Event above their assignments.
2. **Given** a volunteer opens an hourly Event availability task, **When** they enter one or more time spans and save, **Then** the system stores the submission and confirms success.
3. **Given** a volunteer opens a day-based Event availability task, **When** they enter a day span such as Friday to Sunday and save, **Then** the system stores the submission using the Event's day-based granularity.
4. **Given** a volunteer has only partially covered the relevant Event span, **When** they return to the dashboard, **Then** the `Availability needed` task remains visible until the full relevant Event span is covered.

---

### User Story 2 - Review And Respond To Published Assignments (Priority: P1)

A volunteer opens the dashboard, reviews their current and upcoming published Assignments across Ministries, and confirms or declines the ones that still need a response.

**Why this priority**: Volunteers need one clear place to understand what they are scheduled for and to respond before the Event happens.

**Independent Test**: A volunteer with pending published Assignments can open the dashboard, see the first pending Event expanded automatically, respond to an Assignment, and see the updated status reflected immediately.

**Acceptance Scenarios**:

1. **Given** a volunteer has published Assignments across one or more Ministries, **When** they open the dashboard, **Then** `My Upcoming Assignments` shows only their own current and future published Assignments grouped by Event.
2. **Given** an Event group contains a pending Assignment, **When** the volunteer opens the dashboard, **Then** the first Event group with pending responses is expanded automatically.
3. **Given** a volunteer responds to a pending Assignment, **When** they confirm or decline it, **Then** the response is saved per Assignment and the dashboard reflects the new state.
4. **Given** a volunteer changes their mind before the Event starts, **When** they change a previously confirmed Assignment to declined, **Then** the system treats that change as a new decline event and updates the schedule state accordingly.
5. **Given** an Assignment is already in progress, **When** the volunteer views it in the dashboard, **Then** it remains visible with a clear in-progress indicator and disabled response controls until the TimeSlot ends.

---

### User Story 3 - Stay Informed About Schedule Changes (Priority: P1)

A volunteer uses the dashboard inbox to understand scheduling history, including new schedules, assignment changes, reminders, and removals, and can open the most relevant current context from each notification.

**Why this priority**: A volunteer-facing schedule is unreliable if published changes are hard to notice or impossible to trace later.

**Independent Test**: A volunteer receives multiple scheduling notifications, opens the inbox, sees unread styling and historical entries, marks items as read, and follows a notification into the latest relevant dashboard context.

**Acceptance Scenarios**:

1. **Given** scheduling notifications exist for a volunteer, **When** they open the inbox, **Then** the inbox shows a real historical list grouped by date and styled to distinguish unread items from read ones.
2. **Given** a published Assignment changes, **When** the volunteer receives a notification, **Then** the notification describes specifically what changed rather than using vague generic wording.
3. **Given** a volunteer was removed from a published Assignment, **When** they receive the related notification, **Then** the notification clearly says they were removed.
4. **Given** a volunteer taps a notification whose original target has changed, **When** the dashboard opens, **Then** the volunteer is redirected to the most relevant current section and is told that the original content changed.

---

### User Story 4 - Browse The Read-Only Ministry Schedule (Priority: P2)

A volunteer opens the Ministry Schedule section to see the full published schedule for one selected Ministry, including who is serving where, without exposing leader-only data.

**Why this priority**: Shared visibility fosters transparency and teamwork, especially in larger Ministries with multiple Teams.

**Independent Test**: A volunteer can open the Ministry Schedule for a selected Ministry, browse current and upcoming published Events, expand one Event, and view the published assignment layout without seeing leader-only conflict or override information.

**Acceptance Scenarios**:

1. **Given** a volunteer belongs to one Ministry, **When** they open the Ministry Schedule, **Then** the schedule for that Ministry is shown directly without an unnecessary selector.
2. **Given** a volunteer belongs to multiple Ministries, **When** they open the Ministry Schedule, **Then** it defaults to the Ministry of their next upcoming Assignment and still allows manual switching.
3. **Given** the selected Ministry has current or upcoming published Events, **When** the volunteer views the schedule, **Then** Events appear nearest-upcoming first and start collapsed by default.
4. **Given** a volunteer expands one published Event, **When** they review the assignments, **Then** they see the full Ministry schedule across Teams, including names, Roles, TimeSlots, Teams, and confirmation state, but not leader-only conflict or audit detail.

---

### User Story 5 - Use The Dashboard Reliably With Unstable Connectivity (Priority: P2)

A volunteer opens the dashboard in unstable or offline conditions, can still read last-known schedule information, and understands when the displayed data may be outdated.

**Why this priority**: Volunteer coordination often happens at churches, retreats, and travel contexts where connectivity is inconsistent.

**Independent Test**: A volunteer loads the dashboard once online, later opens it offline, reads cached assignments, notifications, and ministry schedule data, and sees clear stale-data messaging without being allowed to submit online-only changes.

**Acceptance Scenarios**:

1. **Given** the volunteer previously loaded the dashboard online, **When** they later open it offline, **Then** the dashboard still shows last-known assignments, notifications, and ministry schedule data.
2. **Given** cached data is being shown, **When** the volunteer views the dashboard, **Then** the interface clearly communicates that the data may be outdated.
3. **Given** the volunteer attempts a manual refresh while offline, **When** the refresh fails, **Then** the dashboard keeps the cached data visible and shows a clear failure message.
4. **Given** connectivity returns, **When** the dashboard refreshes in the background and real data changes occur, **Then** the interface gives a subtle indication that the data was updated in the background.

---

### Edge Cases

- A volunteer has no upcoming Assignments but does owe availability for one or more upcoming Events.
- A volunteer belongs to multiple Ministries but only one has current or upcoming published Events.
- A volunteer opens a notification whose referenced Assignment was removed, moved, or replaced after the notification was created.
- A volunteer submits availability that overlaps a currently published Assignment.
- A volunteer sees cached data offline after the live schedule has changed since the last sync.
- A volunteer has multiple notifications related to repeated edits of the same Assignment.
- A volunteer has an Event with both an in-progress Assignment and future Assignments inside the same Event group.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a canonical volunteer dashboard that combines availability tasks, upcoming assignments, scheduling notifications, and a read-only ministry schedule.
- **FR-002**: The dashboard MUST show `Availability needed` as a dedicated high-priority task section above upcoming assignments whenever at least one upcoming Event is still missing complete availability coverage.
- **FR-003**: The system MUST allow volunteers to enter availability per Event rather than through one global reusable schedule.
- **FR-004**: The system MUST support time-span availability input for hourly Events.
- **FR-005**: The system MUST support day-span availability input for day-based Events.
- **FR-006**: The system MUST treat availability as complete only when the volunteer has covered the full relevant Event span.
- **FR-007**: The system MUST allow volunteers to edit previously submitted availability until the Event starts.
- **FR-008**: The system MUST use an explicit availability save action and give clear success confirmation after saving.
- **FR-009**: If a volunteer saves availability that overlaps a published Assignment, the system MUST warn clearly, require explicit confirmation, and still allow the save.
- **FR-010**: `My Upcoming Assignments` MUST show only the volunteer's own published Assignments that are current or future, grouped by Event across all Ministries.
- **FR-011**: `My Upcoming Assignments` MUST remove cancelled or removed Assignments immediately from that section.
- **FR-012**: The system MUST auto-expand the first Event group that still contains pending Assignment responses.
- **FR-013**: Each collapsed Event group in `My Upcoming Assignments` MUST show Event title, Ministry, next Assignment time, and aggregate response state.
- **FR-014**: The system MUST allow responses per Assignment and MUST NOT require one bulk Event-level response in MVP.
- **FR-015**: The system MUST allow a volunteer to change a previously confirmed Assignment to declined before the Event starts.
- **FR-016**: The system MUST keep current in-progress Assignments visible until their TimeSlot ends and visually distinguish them from future Assignments.
- **FR-017**: The system MUST disable confirm and decline controls once an Assignment is already in progress.
- **FR-018**: The dashboard MUST include a historical Notifications Inbox for scheduling-related events only.
- **FR-019**: The Notifications Inbox MUST support read/unread state, `mark all as read`, and indefinite retention in MVP.
- **FR-020**: The Notifications Inbox MUST load older notifications progressively from newest to oldest instead of rendering the entire history at once.
- **FR-021**: Notifications related to Assignment changes MUST describe the specific change, and removal notifications MUST clearly state that the volunteer was removed.
- **FR-022**: Notification taps MUST open the most relevant current dashboard context; if the original target changed, the volunteer MUST be told that the original content changed.
- **FR-023**: The live dashboard MUST be treated as the source of truth when it differs from older notifications.
- **FR-024**: The read-only Ministry Schedule MUST show the full published schedule for one selected Ministry at a time.
- **FR-025**: The Ministry Schedule MUST allow manual Ministry switching for multi-Ministry volunteers and hide the selector when only one Ministry exists.
- **FR-026**: The Ministry Schedule MUST show only current and upcoming published Events.
- **FR-027**: The Ministry Schedule MUST present published schedule visibility across all Teams in the selected Ministry, including volunteer names, Roles, TimeSlots, Teams, and confirmation state.
- **FR-028**: The Ministry Schedule MUST NOT expose leader-only conflict details, override indicators, or audit reasons.
- **FR-029**: The dashboard MUST allow offline read access to last-known assignments, notifications, and ministry schedule data after prior successful loading.
- **FR-030**: The dashboard MUST clearly indicate when cached offline data may be outdated.
- **FR-031**: The system MUST require an online connection for volunteer writes in MVP, including assignment responses and availability edits.
- **FR-032**: Manual refresh MUST refresh the whole dashboard together.
- **FR-033**: The dashboard MUST automatically recover data when connectivity returns and SHOULD refresh conservatively in the background while online.
- **FR-034**: Routine background refresh MUST stay visually quiet when nothing changed, but MUST signal subtly when refreshed data changed in a visible way.
- **FR-035**: The dashboard MUST use explicit empty-state messaging when there are no upcoming Assignments or no published Ministry Schedule data.

### Key Entities *(include if feature involves data)*

- **Volunteer Dashboard**: The volunteer-facing summary surface that combines tasks, personal schedule visibility, notifications, and one selected Ministry schedule context.
- **Availability Task**: A pending requirement for a volunteer to submit complete Event-specific availability before leaders can confidently schedule that Event.
- **Event Availability Entry**: A volunteer-owned record describing time-span or day-span availability for one specific Event.
- **Upcoming Assignment Group**: A volunteer-facing Event grouping that contains the volunteer's current and future published Assignments plus an aggregate response state.
- **Scheduling Notification**: A historical volunteer-facing record describing a published schedule event such as publication, reminder, assignment change, or removal.
- **Ministry Schedule View**: A read-only published schedule snapshot for one selected Ministry, including full Team visibility but excluding leader-only operational details.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A volunteer can open the dashboard and identify whether they still owe availability for an upcoming Event in under 10 seconds.
- **SC-002**: A volunteer can confirm or decline a pending published Assignment in under 30 seconds from dashboard open.
- **SC-003**: At least 90% of volunteer assignment-change notifications clearly communicate what changed without requiring a support explanation or leader follow-up.
- **SC-004**: Volunteers can still view their last-known current/upcoming schedule information during temporary connectivity loss after at least one successful online dashboard load.
- **SC-005**: Volunteers can distinguish current in-progress service from future upcoming service without needing a separate explanation from a leader.

## Assumptions

- The existing scheduling domain concepts for Events, TimeSlots, Assignments, Teams, and published schedule state remain in force.
- Push notifications already exist or are being delivered through the project's broader scheduling notification capability.
- Volunteers authenticate through the project's existing protected user experience and do not need a new authentication model for this feature.
- The volunteer dashboard is mobile-first but still usable in larger browser contexts.
- Notification history growth is acceptable in MVP as long as the interface progressively loads older items instead of rendering them all at once.
