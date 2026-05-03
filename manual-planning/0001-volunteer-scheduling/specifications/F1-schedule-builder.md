# Spec F1: Schedule Builder (Desktop)

## Purpose
Define the complex, desktop-first UI for Ministry Leaders to build and manage volunteer schedules.

## 1. Core Layout
- **Event Header**: Title, Date Range, Status (Draft/Published), and "Publish" button.
- **Sidebar (Volunteer Pool)**:
    - Search/Filter by name or role.
    - Status indicators (Available, Conflict, Double-booked).
    - Drag handles for each volunteer.
- **Main Canvas (Timeline View)**:
    - **Rows**: Time Slots.
    - **Columns**: Roles/Requirements (e.g., "Projectionist 1", "Projectionist 2", "Sound").
    - **Cells**: Drop zones for assignments.

## 2. Interaction Rules
- **Drag and Drop**: 
    - Volunteers can be dragged from the Sidebar into a Slot/Role cell.
    - Dragging triggers an immediate background call to the `Availability Engine`.
- **In-Place Validation**:
    - If a volunteer is dropped into a conflict, show an immediate Orange (Double-booked) or Red (Unavailable) highlight.
    - Clicking the conflict shows the `Override` dialog.
- **Slot Management**:
    - Leaders can add/remove slots or edit the "Required Count" for a role directly in the grid.

## 3. Real-time Feedback
- **Staffing Meter**: A percentage bar showing how many requirements are fulfilled (e.g., "75% Staffed").
- **Saving State**: "Auto-saving..." indicator to reassure the user.

## 4. Frontend Technology
- **React 19** + **Vite**.
- **TanStack Router** for deep linking to specific events.
- **Dnd-kit** (or similar) for accessible, performant drag and drop.
- **Shadcn/UI** for components (Table, Dialogs, Popovers).

## 5. Testing Requirements (Mandatory)
- **Component**: Verify that dragging a volunteer into a cell correctly triggers the validation visual.
- **Integration**: Verify that "Publish" button is disabled if `Hard Enforcement` rules are violated.
- **E2E**: Full journey - Create slot -> Drag volunteer -> Overcome conflict -> Publish.

## 🔗 References
- [Spec 10: Scheduling API](./10-scheduling-api.md)

## 🔴 Mandatory UI Component Rule
Everything must be built exclusively using standard **shadcn/ui** components. Do not build custom UI elements from scratch. Make as few modifications as possible. If a component is missing, pause and ask the user to find a community implementation.
