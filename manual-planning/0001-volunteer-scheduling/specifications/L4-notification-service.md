# Spec L4: Notification Service

## Purpose
Handle the delivery of PWA Web Push notifications and in-app alerts.

## 1. Trigger Types
- `ASSIGNMENT_PUBLISHED`: When a schedule is published.
- `REMINDER_SENT`: 24 hours before a shift.
- `VOLUNTEER_DECLINED`: Notify leader when a volunteer cancels.

## 2. Delivery Channels
- **PWA Web Push**: Using the browser's `PushManager` and VAPID keys.
- **Internal Alert**: Stored in a `notification` table for the "Inbox" view.

## 3. Worker Integration
- The service should expose a method `sendReminders()` to be called by a cron job (e.g., Bun.serve or a background worker).
- It should query for assignments starting in 24 hours and send notifications to volunteers who haven't opted out.

## 4. Testing Requirements (Mandatory)
- **Unit**: Verify that notification payloads follow the predefined JSON schema.
- **Integration**: Verify that `sendReminders` correctly identifies the target assignments for the next 24h window.
- **Security**: Verify that a user can only subscribe to their own push notifications.

## 🔗 References
- [Spec 11: Notifications](./11-notifications.md)
