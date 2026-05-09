# Spec F0: Global UI Framework

## Purpose
Define the foundational "App Shell" and design tokens that govern the visual and structural consistency of the entire Volunteer Scheduling platform.

## 1. Layout Architecture (AppShell)
- **Responsive Shell**: A single root layout that adapts to screen size:
    - **Desktop**: Left-side vertical sidebar (collapsible) + Top Bar with Breadcrumbs.
    - **Mobile**: Sticky Top Bar + Fixed Bottom Navigation Bar + Sheet (Drawer) for secondary items.
- **Regions**:
    - **Sidebar**: 240px expanded / 64px collapsed.
    - **Top Bar**: 64px height; contains Breadcrumbs and Search Trigger.
    - **Bottom Nav**: 56px height; contains 4 core pillars (Dashboard, Shifts, Alerts, Profile).
    - **Content Area**: Fluid width with maximum readability constraints (e.g., `max-w-7xl`).

## 2. Design System (Tokens)
- **Palette**: Mono-accented "Clinical" aesthetic.
    - **Primary**: Zinc / Slate (High contrast).
    - **Accents**: Subtle semantic colors (Success: Green, Conflict: Orange, Alert: Red).
- **Typography**: 
    - **UI**: Inter (Modern Sans-serif).
    - **Data**: JetBrains Mono (For times, counts, and IDs).
- **Surface**:
    - **Corner Radius**: Sharp (4px) for all elements.
    - **Borders**: 1px `border-muted` as the primary separator (avoid heavy shadows).

## 3. Navigation System
- **Pillars**:
    1. **Dashboard**: Unified overview of status and upcoming tasks.
    2. **Schedules**: Access to ministry/team-specific builders and grids.
    3. **Users**: Management of the volunteer pool.
- **Contextual Bridge**:
    - Integration with **TanStack Router** for deep-linking and state preservation.
    - **Global Search (CMD+K)**: Centrally managed command palette for rapid navigation.

## 4. Interaction & Motion
- **Physics**: `framer-motion` spring-physics for all layout transitions.
- **Drawers**: `Vaul` for native-feeling mobile modals (Bottom-aligned, pull-to-dismiss).
- **Feedback**: Immediate haptic vibrations for critical status changes on mobile.

## 5. Technical Implementation (Standard)
- **Framework**: React 19 + Vite.
- **UI Base**: `shadcn/ui` (Strict Adherence).
- **Accessibility**: 100% WCAG 2.1 compliance for contrast and touch targets (44x44px).

## 🔗 References
- [Design Brief](../design-brief.md)
- [DESIGN.md](../DESIGN.md)
