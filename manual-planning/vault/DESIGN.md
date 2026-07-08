# Design System — Volunteer Scheduling (Superseded by apps/web/DESIGN.md)

This document has been updated to align with the canonical design system established via the Impeccable tool in [apps/web/DESIGN.md](../../apps/web/DESIGN.md).

## Creative North Star
- **Atmosphere**: "The Legible Sanctuary" — calm, accessibility-first scheduling workspace for volunteers and ministry planners.
- **Density**: Flexes by device: compact on desktop admin screens (8/10), larger touch targets on mobile volunteer screens.
- **Warmth**: Clean, cool neutrals ("Cool Paper" background) with a single blue-violet accent.
- **Motion**: Subtle, spring-physics driven feedback via `framer-motion`.

## Visual Architecture
- **Sidebar**: Collapsible to 64px slim-icons; 240px expanded. Collapses via spring transition.
- **Top Bar**: Unified command center with Search (Center), Contextual Actions, and the single Notification Bell (Right).
- **Corner Radius**: 
  - Control components (buttons, inputs): `radius-control` (8px, `rounded.md`).
  - Containers (cards, panels): `radius-surface` (10px, `rounded.lg`).
- **Navigation Components**:
  - Desktop: Vertical Sidebar with role-scoped nav sets.
  - Mobile: Sticky Top Header + Fixed Bottom Navigation Bar (44px+ touch targets).
  - **Search**: CMD+K Command palette.
- **Borders & Elevation**: Flat by default with subtle 1px borders (`ring-1 ring-foreground/10` or `border`) at rest. Resting shadow is forbidden; shadow is reserved for floating/temporary overlays (dropdowns, dialogs, drawers, dragged items).

## Typography
- **UI & Body (Primary)**: Atkinson Hyperlegible (Accessibility-first sans-serif designed for low-vision readers).
- **Data (Mono)**: JetBrains Mono (For timestamps, counts, and system IDs).
- **Scale**: Tight, minor-third based scale. No display/body pairing (Atkinson Hyperlegible carries all weights).

## Interaction Design
- **States**: Hover, focus-visible (1px ring glow), disabled, loading, and error states.
- **Feedback**: Snappy spring-physics (`Stiffness: 400, Damping: 30`) via `framer-motion`.
- **Modals & Drawers**:
  - Desktop: Standard `Dialog` (Center).
  - Mobile: `Vaul` Drawer (Bottom-aligned; pull-to-dismiss).
- **Status Colors (Traffic-Light Exception)**: Confirmed Green (`#16a34a`), Pending Amber (`#eab308`), Conflict Red (`#dc2626`/`destructive`) are reserved strictly for staffing percentages and assignment confirmation states.

## References
- [apps/web/DESIGN.md](../../apps/web/DESIGN.md)
- [apps/web/src/index.css](../../apps/web/src/index.css)
