# UI Decision Log

| Date | Decision ID | Feature | Proposed Change | Rationale | Impact | Approved? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-05-09 | UI-001 | Global Layout | Redesign of the main dashboard, sidebar, and navigation system using Google Stitch and shadcn/ui. | The existing template layout does not meet the premium aesthetic and functional requirements for the Volunteer Scheduling system. | High - Affects every page in the application. | Approved |
| 2026-05-09 | UI-002 | Mobile Navigation | Bottom Navigation Bar for primary pillars (Dashboard, Shifts, Alerts, Profile) + Sheet (Drawer) for secondary items. | Optimized for thumb-first PWA experience without reinventing standard mobile patterns. | Medium - Affects all mobile views. | Approved |
| 2026-05-09 | UI-003 | Mobile Search | Dedicated search icon in the sticky Top Bar (Top Right) to trigger the Command palette. | Provides functional parity with CMD+K on desktop without sacrificing vertical space. | Low - Search interaction only. | Approved |
| 2026-05-09 | UI-004 | Data Density Strategy | Personal view: Calendar/List; Management view: Grid/Timeline. Use Data Cards for lists. | Balances intuitive personal use with high-efficiency team management. | Medium - Affects core data presentation. | Approved |
| 2026-05-09 | UI-005 | Motion & Fidelity | Spring-physics transitions (Framer Motion) + Vaul Drawers + Haptic Feedback. | Achieves a "premium" feel while maintaining the "clinical" and simple Karpathy guidelines. | Low - UX enhancement. | Approved |
