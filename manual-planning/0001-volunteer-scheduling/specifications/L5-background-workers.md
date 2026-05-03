# Spec L5: Background Workers & Cron

## Purpose
Define the background tasks required to keep the scheduling application state accurate and to trigger timely alerts.

## Required Tasks
1. **Reminder Dispatcher**: Runs hourly to detect assignments that are starting exactly 24 hours from now, and triggers the Notification Service.
2. **Invite Cleanup**: Runs daily to delete or invalidate `MinistryInvitation` tokens that have surpassed their `expires_at` threshold.
3. **Event Archiver**: Runs daily to sweep past events and cleanly mark them as 'completed' to keep active queries performant.

## Execution Model
- As an MVP, these can be simple scheduled functions via a reliable job runner, ensuring they do not block the main tRPC request lifecycle.
