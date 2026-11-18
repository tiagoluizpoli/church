# Research: Global UI Framework

## Layout Architecture & Component Library

- **Decision**: `shadcn/ui` based on Radix Primitives + Tailwind CSS v4.
- **Rationale**: Strict constitution alignment. No custom inventions. Radix handles WAI-ARIA compliance.
- **Alternatives considered**: Headless UI (rejected due to shadcn ecosystem dominance in repository).

## Navigation Drawer (Mobile)

- **Decision**: `Vaul` bottom-aligned drawers.
- **Rationale**: Provides native-feeling pull-to-dismiss behavior on mobile viewports.
- **Alternatives considered**: Standard Tailwind dialogs (rejected because of poor mobile UX).

## Animation Physics

- **Decision**: Framer Motion with spring physics (`stiffness: 300, damping: 30`).
- **Rationale**: Matches "clinical, fast" aesthetic. Avoids linear/ease animations for premium feel.
- **Alternatives considered**: CSS Transitions (rejected due to layout shift constraints).
