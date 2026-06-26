# Spec L5: Background Workers & Cron

## Purpose
Define the background tasks required to keep the scheduling application state accurate and to trigger timely alerts.

- **Queue & Scheduler**: Use `pg-boss` (latest version) as the job manager.
- **Monitoring**: Run `@pg-boss/dashboard` for queue and job administration.

## 2. Required Tasks

### 1. Reminder Dispatcher (`send-reminder`)
- **Execution Model**: **Delayed One-Off Jobs**.
- **Scheduling**: When an event schedule is published, enqueue a delayed job in pg-boss for each assignment: `boss.send('send-reminder', { assignmentId }, { startAfter: slot.startTime - 24h })`.
- **Validation**: When executing the job, the handler queries the DB for the assignment. If it has been cancelled, declined, or the volunteer changed, the job finishes as a clean no-op.
- **Fault Tolerance**: Wrap the individual dispatch in a try/catch. Log failures and continue processing other jobs.

### 2. Invite Cleanup (`invite-cleanup`)
- **Execution Model**: Recurring cron job (Runs daily at midnight).
- **Behavior**: Physically delete all `MinistryInvitation` records whose `expires_at` has passed.

### 3. Event Archiver (`event-archiver`)
- **Execution Model**: Recurring cron job (Runs daily at 01:00 AM).
- **Behavior**: Query past events and call `AssignmentManagerService.transitionExpiredEvent` to mark them as completed/past.

## 3. Testing Requirements (Mandatory)
- **Integration**: Verify that publishing an event schedules one-off pg-boss jobs with correct `startAfter` values.
- **Integration**: Verify that `send-reminder` job exits as a clean no-op if the target assignment is cancelled/deleted before execution.
- **Integration**: Verify that the daily `invite-cleanup` physically deletes expired invitation rows.
