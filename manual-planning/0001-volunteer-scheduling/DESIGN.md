# Design System — Volunteer Scheduling

## Atmosphere
- **Mood**: Precision-engineered cockpit; high-utility "Linear" aesthetic.
- **Density**: 8/10 (Power User / Data-Dense)
- **Variance**: 2/10 (Highly predictable, grid-based layout)
- **Motion**: 4/10 (Subtle, spring-physics driven feedback)
- **Warmth**: 3/10 (Clinical, focused on technical precision)

## Visual Architecture
- **Sidebar**: Collapsible to 64px slim-icons; 240px expanded. 
- **Top Bar**: Unified command center with Search (Center) and Contextual Actions (Right).
- **Corner Radius**: Sharp (4px) for all cards, buttons, and inputs.
- **Navigation Components**:
  - Desktop: Vertical Sidebar with `NavigationMenu`.
  - Mobile: Fixed Bottom Navigation Bar + `Drawer` (Sheet) for overflow.
  - **Search**: Top Bar icon (Mobile) vs. Center search bar (Desktop); both trigger the `Command` component.
- **Data Density (8/10)**:
  - **Cards**: Sharp 4px corners; high-contrast typography (Inter + JetBrains Mono).
  - **Grid**: Horizontal scrollable with frozen first column for team scheduling.
- **Borders**: Subtle 1px borders (`border-muted`) instead of heavy shadows.

## Typography
- **Primary (UI)**: Inter (Modern Sans-serif)
- **Data (Mono)**: JetBrains Mono (For counts, dates, and IDs)
- **Scale**: Minor Third (1.200) for tight, technical spacing.

## Interaction Design
- **States**: Subtle & Premium (slight opacity shifts, delicate 1px inner glows).
- **Feedback**: Immediate spring-physics for "snappy" feel (Stiffness: 400, Damping: 30) via `framer-motion`.
- **Modals**:
  - Desktop: Standard `Dialog` (Center).
  - Mobile: `Vaul` Drawer (Bottom-aligned; pull-to-dismiss).
- **Haptics**: Light vibrations on mobile for status changes.
- **Empty States**: Minimalist typography-driven layouts (no bulky illustrations).
