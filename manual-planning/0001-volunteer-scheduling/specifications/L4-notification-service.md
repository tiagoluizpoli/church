# Spec L4: Notification Service

## Purpose
Handle the delivery of PWA Web Push notifications and in-app alerts.

## 1. Trigger Types
- `ASSIGNMENT_PUBLISHED`: When a schedule is published.
- `REMINDER_SENT`: 24 hours before a shift.
- `VOLUNTEER_DECLINED`: Notify leader when a volunteer cancels.

## 2. Delivery Channels
- **PWA Web Push**: Enforce delivery via browser `PushManager` using VAPID keys loaded from environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
  - Subscriptions stored in `push_subscription` table: `id` (uuid), `church_id` (uuid), `user_id` (text, FK to auth user), `endpoint` (text), `keys_p256dh` (text), `keys_auth` (text), `created_at`.
- **Internal Alert**: Stored in `notification` table for inbox: `id` (uuid), `church_id` (uuid), `user_id` (text, FK to auth user), `title` (text), `body` (text), `type` (text), `read_at` (timestamp, null), `created_at`.

## 3. Preferences & Policies
- **User Preference**: Store push toggle in `notification_preferences` (jsonb) column on `volunteer` table (default: `{"pushEnabled": true}`).
- **Subscription Cleanup**: If push server returns 410 (Gone/Expired token), immediately delete the subscription record from the database.
- **Localization**: Titles/bodies generated on-server using simple localized templates (Portuguese/English depending on configuration) mapped directly in Notification Service.

## 4. Worker Integration
- The service should expose a method `sendReminders()` to be called by a cron job (e.g., Bun.serve or a background worker).
- It should query for assignments starting in 24 hours and send notifications to volunteers who haven't opted out.

## 5. Testing Requirements (Mandatory)
- **Unit**: Verify that notification payloads follow the predefined JSON schema.
- **Integration**: Verify that `sendReminders` correctly identifies the target assignments for the next 24h window.
- **Security**: Verify that a user can only subscribe to and view their own notifications.
- **Cleanup**: Verify that 410 errors trigger physical deletion of the push subscription.

## 🔗 References
- [Spec 11: Notifications](./11-notifications.md)
