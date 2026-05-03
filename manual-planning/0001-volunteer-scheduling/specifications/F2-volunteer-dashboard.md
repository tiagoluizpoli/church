# Spec F2: Volunteer Dashboard (Mobile/PWA)

## Purpose
Define the simplified, mobile-first interface for volunteers to manage their service and availability.

## 1. Core Views
- **Home / "My Upcoming Shifts"**:
    - List of assignments in chronological order.
    - Status indicators: `Pending` (needs confirmation), `Confirmed`, `Declined`.
    - "Confirm" and "Decline" buttons for each pending shift.
- **Availability Planner**:
    - Simple calendar view.
    - Long-press to add "Unavailable" (Blockout) date.
    - List of existing blockouts with "Delete" option.
- **Notifications Inbox**:
    - List of recent alerts (e.g., "Schedule Published", "Reminder").

## 2. PWA Features
- **Add to Home Screen**: Prompt for installation.
- **Push Notification Toggle**: Allow the user to opt-in to Web Push.
- **Offline Support**: Basic caching of "Upcoming Shifts" so they are viewable without internet.

## 3. Interaction Rules
- **Confirm/Decline**: Clicking "Decline" must trigger a "Reason" dialog (optional but encouraged).
- **Blockouts**: Adding a blockout for a date where an assignment already exists should show a "Warning: You are already assigned to X on this date."

## 4. Testing Requirements (Mandatory)
- **Component**: Verify that the "Confirm" button correctly updates the assignment status.
- **Accessibility**: Ensure all buttons have a minimum touch target size of 44x44px.
- **Integration**: Verify that adding a blockout immediately notifies the relevant Ministry Leader if it conflicts with a published assignment.

## 🔗 References
- [Spec 03: Assignments & Availability](./03-assignments-availability.md)
- [Spec 10: Scheduling API](./10-scheduling-api.md)

## 🔴 Mandatory UI Component Rule
Everything must be built exclusively using standard **shadcn/ui** components. Do not build custom UI elements from scratch. Make as few modifications as possible. If a component is missing, pause and ask the user to find a community implementation.
