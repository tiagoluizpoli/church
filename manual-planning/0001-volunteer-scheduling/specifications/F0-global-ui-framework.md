# Spec F0: Global UI Framework

> **⚠️ Partially superseded & fully redesigned (2026-07-06) — Spec 018: Church-wide UX/IA Redesign.** The layout and design tokens below have been updated and implemented per the Impeccable Design System in [apps/web/DESIGN.md](../../../apps/web/DESIGN.md): (1) §1's bottom-nav pillars are replaced by role-scoped nav sets with a top-bar notification bell and no dead links; (2) §2's typography is now Atkinson Hyperlegible, and the corner radius token is now 8px (md) / 10px (lg) instead of sharp 4px. Authoritative sources: [spec.md](../../../specs/018-churchwide-ux-redesign/spec.md) and [apps/web/DESIGN.md](../../../apps/web/DESIGN.md).

## Purpose
Define the foundational "App Shell" and design tokens that govern the visual and structural consistency of the entire Volunteer Scheduling platform.

## 1. Layout Architecture (AppShell)
- **Responsive Shell**: A single root layout that adapts to screen size:
    - **Desktop**: Left-side vertical sidebar (collapsible) + Top Bar with Breadcrumbs.
    - **Mobile**: Sticky Top Bar + Fixed Bottom Navigation Bar + Sheet (Drawer) for secondary items.
- **Regions**:
    - **Sidebar**: 240px expanded / 64px collapsed.
    - **Top Bar**: 64px height; contains Breadcrumbs and Search Trigger.
    - **Bottom Nav / Mobile Header**: 56px height bottom bar + sticky top header; contains role-scoped nav items (Volunteer: Dashboard, Availability; Leader: +Scheduling).
    - **Notification Bell**: Single notification center in desktop top-bar and mobile top header (recent dropdown list + unread count badge + `/notifications` history page).
    - **Content Area**: Fluid width with maximum readability constraints (e.g., `max-w-7xl`).

## 2. Design System (Tokens)
- **Palette**: Calm, legible sanctuary aesthetic.
    - **Primary**: Deep Chapel Blue (`oklch(0.378 0.09 255)`) — ≤10% visual surface.
    - **Background**: Cool Paper (`oklch(0.978 0.004 236)`).
    - **Status (Traffic-Light)**: Confirmed Green (`#16a34a`), Pending Amber (`#eab308`), Conflict Red (`#dc2626`).
- **Typography**: 
    - **UI & Body**: Atkinson Hyperlegible (Accessibility-first, sans-serif).
    - **Data**: JetBrains Mono (For timestamps, counts, and IDs).
- **Surface**:
    - **Corner Radius**: `radius-control` (8px, `rounded.md`) for inputs/buttons, `radius-surface` (10px, `rounded.lg`) for cards.
    - **Borders & Elevation**: Flat at rest with subtle 1px border/ring (`ring-1 ring-foreground/10`); shadow reserved only for floating/overlay elements (popovers, dropdowns, dialogs, drawers).

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
- [Design Brief](../../../vault/design-brief.md)
- [DESIGN.md](../../../apps/web/DESIGN.md)
