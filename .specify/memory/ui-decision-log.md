# UI Decision Log

| Date | Decision ID | Feature | Proposed Change | Rationale | Impact | Approved? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-05-09 | UI-001 | Global Layout | Redesign of the main dashboard, sidebar, and navigation system using Google Stitch and shadcn/ui. | The existing template layout does not meet the premium aesthetic and functional requirements for the Volunteer Scheduling system. | High - Affects every page in the application. | Approved |
| 2026-05-09 | UI-002 | Mobile Navigation | Bottom Navigation Bar for primary pillars (Dashboard, Shifts, Alerts, Profile) + Sheet (Drawer) for secondary items. | Optimized for thumb-first PWA experience without reinventing standard mobile patterns. | Medium - Affects all mobile views. | Approved |
| 2026-05-09 | UI-003 | Mobile Search | Dedicated search icon in the sticky Top Bar (Top Right) to trigger the Command palette. | Provides functional parity with CMD+K on desktop without sacrificing vertical space. | Low - Search interaction only. | Approved |
| 2026-05-09 | UI-004 | Data Density Strategy | Personal view: Calendar/List; Management view: Grid/Timeline. Use Data Cards for lists. | Balances intuitive personal use with high-efficiency team management. | Medium - Affects core data presentation. | Approved |
| 2026-05-09 | UI-005 | Motion & Fidelity | Spring-physics transitions (Framer Motion) + Vaul Drawers + Haptic Feedback. | Achieves a "premium" feel while maintaining the "clinical" and simple Karpathy guidelines. | Low - UX enhancement. | Approved |

## 2026-06-27 — Schedule Builder a11y violations (T124)

axe-core scan of the populated builder (`/scheduling/events/:id/builder`) found:
- **nested-interactive (critical)**: empty `RequirementCell` renders `<button>` wrapping `SuggestionList`, which itself contains `<button>Accept</button>`; `AssignmentPicker` trigger also wraps the `AssignmentChip` `<button>`. Button-in-button is invalid + fails WCAG.
- **button-name (critical)**: some icon-only buttons lack an accessible name.
- **color-contrast (serious)**: white text on `bg-green-600` (#00a63e) badges = 3.21:1 (need 4.5:1). Affects StaffingMeter/suggestion/availability badges.

These require UI changes (restructure cell interactivity; darken badge colors or enlarge/bolden text; add aria-labels). **Awaiting user approval** before editing UI. T124 (a11y E2E) deferred until resolved.

### RESOLVED 2026-06-27 — approved & fixed
User approved fixing all three. Changes: RequirementCell empty state no longer wraps SuggestionList in a button (separate "Choose volunteer…" trigger) — clears nested-interactive + button-name; badge colors green-600→green-700, orange-500→orange-600, gray-400→gray-600 for ≥4.5:1 contrast; aria-label added to the role Select trigger. T124 axe scan now passes (0 critical/serious).

## 2026-06-27 — BUG: override flow double-creates (found via T107 E2E)
Assigning a conflicted (unavailable) volunteer via the cell picker:
1. `createAssignment` does NOT return a conflictReport for an UNAVAILABLE volunteer — it creates the draft assignment cleanly (server-side availability/soft-conflict detection appears not to flag the unavailable block for this path).
2. The grid then shows the assignment with a *client-side* conflict badge + an "Override" button.
3. Clicking "Override" → confirming calls `createAssignment` again with `allowOverride` → tries to INSERT a second active row for the same (slot, volunteer) → blocked by `assignment_slot_volunteer_idx`.

Expected (US2): assigning a conflicted volunteer should open the OverrideDialog BEFORE persisting (or the override path should UPDATE the existing draft rather than insert). Needs backend investigation: (a) why `ConflictValidationService.validate` / availability check doesn't flag the unavailable volunteer in `create-assignment.ts`; (b) make override update-in-place. T107 E2E deferred until fixed.
