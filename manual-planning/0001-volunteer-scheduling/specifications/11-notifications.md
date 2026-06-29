# Spec 11: Application — Notifications & Alerts

## Purpose
Keep volunteers informed of their schedule and changes via PWA Push Notifications and In-App alerts.

---

## 1. Event Triggers
- **Schedule Published**: All volunteers in the event receive a "New Schedule" push.
- **Assignment Changed**: Volunteers receive specific notifications when a published assignment changes.
- **Assignment Removed**: Volunteers receive a clear removal notification when they are no longer serving a published assignment.
- **Availability Reminder**: Leaders may trigger reminders for volunteers who still owe event availability.
- **Assignment Reminder**: Sent X hours before the shift (Background job).
- **Sub-leader Alert**: Notify the sub-leader when a volunteer declines an assignment.

---

## 2. Notification Preferences
Volunteers can opt-in/out of:
- Push Notifications (Global toggle).
- Email Reminders (Future).

---

## 3. Inbox Behavior

- Scheduling notifications are stored as a real historical inbox for the volunteer.
- The live dashboard remains the source of truth; notifications are historical records.
- Notifications support read/unread state and `mark all as read`.
- Notifications are retained indefinitely in MVP.
- Older notifications load progressively from newest to oldest.
- If a notification deep-link target no longer exists, the client should redirect to the most relevant current section and explain that the original content changed.

---

## 4. Testing Requirements (Mandatory)
- **Unit**: Verify that notification payloads follow the predefined schema for the mobile app.
- **Integration**: Verify that `publishSchedule` only notifies volunteers who are actually assigned to a slot.
- **Security**: Verify that a user cannot see notifications belonging to another `user_id`.
- **Worker**: Verify that the reminder job correctly filters for assignments in the upcoming 24-hour window.
