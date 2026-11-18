# Implementation Plan: Global UI Framework

**Branch**: `012-global-ui-framework` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-global-ui-framework/spec.md`

## Summary

Implement root responsive AppShell layout, command palette, and dark mode provider matching the clinical design system. Setup TanStack Router tree integration.

## Technical Context

**Language/Version**: TypeScript 5, React 19

**Primary Dependencies**: Vite, Tailwind CSS v4, Lucide React, Framer Motion, Vaul, TanStack Router

**Storage**: LocalStorage (for theme preference)

**Testing**: Vitest, Playwright (E2E)

**Target Platform**: Web (Desktop & Mobile PWA)

**Project Type**: web-app

**Performance Goals**: Layout paint under 100ms, transitions under 150ms

**Constraints**: Mobile touch targets >= 44x44px, sharp corners (4px radius)

**Scale/Scope**: Single global app shell wrapping all routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Domain-First Architecture**: Yes, follows specifications-list.md F0 spec.
- **Full-Stack Type Safety**: Yes, uses React type parameters, TanStack Router type safety.
- **Container-Ready Infrastructure**: Yes, runs within the local dev setup.
- **Environment Discipline**: Yes, no new environment variables needed for UI layout.
- **Automated Code Standards**: Yes, uses Biome linting/formatting.
- **Maximum Context**: Yes, parsed F0 spec and specifications-list.md.

## Project Structure

### Documentation (this feature)

```text
specs/012-global-ui-framework/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── quickstart.md        # Phase 1 output
```

### Source Code

```text
apps/web/src/
├── components/
│   ├── AppShell.tsx      # Sidebar, topbar, bottom nav
│   ├── CommandPalette.tsx # CMD+K global palette
│   └── ThemeProvider.tsx # Theme context
├── routes/
│   ├── __root.tsx        # Integrates AppShell and providers
└── index.css             # Tailwind v4 custom tokens
```

**Structure Decision**: Standard web monorepo structure. Updates will be located inside `apps/web`.
