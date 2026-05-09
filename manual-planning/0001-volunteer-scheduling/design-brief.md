# Volunteer Scheduling: Design Brief

## 1. Visual Identity & Vibe
- **Atmosphere**: Clinical & Efficient (Linear/GitHub style).
- **Core Principles**: High utility, clean lines, fast interactions.
- **Color Palette**: (Pending User Choice)
- **Typography**: Mono-accented (Inter for UI, JetBrains Mono for data).

## 2. Layout Architecture
- **Navigation**:
  - Desktop: Sidebar (Collapsible to 64px slim icons; 240px expanded).
  - Mobile: **Bottom Navigation Bar** for primary pillars (Dashboard, Shifts, Alerts, Profile) + **Sheet (Drawer)** for secondary items.
- **Navigation Pillars**:
  1. **Schedules**: Calendar and grid views.
  2. **Ministry & Teams**: Organizational management.
  3. **Users**: Unified user/volunteer management.
- **Top Bar**:
  - Breadcrumbs (Left)
  - Global Search:
    - Desktop: Center (CMD+K)
    - Mobile: Icon trigger (Top Right) opens full-screen Command palette.
  - Contextual Actions & User Status (Right)

- **Viewing Modes**:
  - **Volunteer View**: Calendar/List based (Focus on personal schedule; "Natural" feel).
  - **Leader View**: Grid/Timeline based (Focus on team management; "Efficient" feel).

## 3. Interaction Design
- **Density**: Power User / Data-Dense.
- **Corner Radius**: Sharp (2px-4px).
- **Motion & Fidelity**:
  - **Physics**: Spring-physics driven transitions (`Stiffness: 400, Damping: 30`).
  - **Modals**: Native-feeling `Vaul` drawers for all mobile interactions.
  - **Feedback**: Subtle haptic vibrations for critical actions (Confirm/Decline).
- **Interactions**: Subtle & Premium.
