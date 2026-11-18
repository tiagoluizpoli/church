# Volunteer Scheduling: Design Brief (Superseded by apps/web/DESIGN.md & Spec 018)

This document is aligned with the design system and navigation architecture defined in [apps/web/DESIGN.md](../../apps/web/DESIGN.md) and [spec.md](../../specs/018-churchwide-ux-redesign/spec.md).

## 1. Visual Identity & Vibe
- **Atmosphere**: "The Legible Sanctuary" — calm, legible, accessibility-first workspace.
- **Core Principles**: High legibility, clean lines, flat surfaces, task-focused workflows.
- **Color Palette**: Cool Paper (`oklch(0.978 0.004 236)`) background, Deep Chapel Blue (`oklch(0.378 0.09 255)`) primary accent, with custom traffic-light status colors reserved strictly for staffing.
- **Typography**: Atkinson Hyperlegible (Accessibility-first sans-serif designed for low-vision readers), JetBrains Mono for data (times, counts, IDs).

## 2. Layout Architecture
- **Navigation (Role-Scoped)**:
  - Desktop: Collapsible Left Sidebar (64px ↔ 240px) + Top Bar.
  - Mobile: Sticky Top Header + Fixed Bottom Navigation Bar.
- **Navigation Set**:
  - **Volunteer**: Dashboard, Availability.
  - **Leader / Sub-leader / Admin**: Dashboard, Availability, + Scheduling.
  - *Note*: Stale nav pillars (Shifts, Profile, Todos) are removed entirely.
- **Top Bar / Header**:
  - Breadcrumbs (Desktop left)
  - Global Search (Center, CMD+K palette)
  - Notification Bell (Right) — acts as the single notification center, showing unread badge count and recent dropdown list, with a "View all" link pointing to `/notifications` history.

## 3. Interaction Design
- **Density**: Compact on desktop admin screens; 44px+ touch targets on mobile/volunteer-facing views.
- **Corner Radius**: `radius-control` (8px, `rounded.md`) for inputs/buttons, `radius-surface` (10px, `rounded.lg`) for cards.
- **Motion & Elevation**:
  - **Physics**: Snappy spring-physics transitions (`Stiffness: 400, Damping: 30`) via `framer-motion`.
  - **Modals**: Desktop dialogs; Vaul bottom drawer sheets on mobile.
  - **Elevation Vocabulary**: Flat surfaces at rest. Shadows are reserved for floating/overlay elements (popovers, dropdowns, sheets, dragged items).
