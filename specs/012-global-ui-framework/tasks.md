# Tasks: Global UI Framework

**Input**: Design documents from `/specs/012-global-ui-framework/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: TDD required (using Playwright E2E tests). Write tests first, verify fail, then implement.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project folders and file scaffolding under `apps/web/src/components/` and `apps/web/e2e/`
- [x] T002 Configure tailwind design tokens in `apps/web/src/index.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core layout scaffolding that MUST be complete before user stories can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Scaffolding AppShell layout component frame in `apps/web/src/components/AppShell.tsx`
- [x] T004 Integrate AppShell layout as root component wrapper in `apps/web/src/routes/__root.tsx`

---

## Phase 3: User Story 1 - Desktop Layout Shell (Priority: P1) 🎯 MVP

**Goal**: Sidebar navigation, top bar, and responsive layout for desktop screens

**Independent Test**: Mount AppShell layout. Verify collapsing sidebar (240px -> 64px) and top bar.

### Tests for User Story 1

- [x] T005 [P] [US1] Create Playwright E2E test verifying sidebar expand/collapse buttons in `apps/web/e2e/desktop-layout.spec.ts`

### Implementation for User Story 1

- [x] T006 [US1] Implement expanded and collapsed states in vertical navigation sidebar in `apps/web/src/components/AppShell.tsx`
- [x] T007 [US1] Implement top bar with dynamic breadcrumbs matching current route path in `apps/web/src/components/AppShell.tsx`
- [x] T008 [US1] Integrate navigation links and hover animation states in `apps/web/src/components/AppShell.tsx`

---

## Phase 4: User Story 2 - Mobile Responsive Navigation (Priority: P1)

**Goal**: Bottom navigation bar and mobile drawer for screens below 768px

**Independent Test**: Render layout at mobile viewport (390px). Verify sticky top bar, bottom bar, and bottom drawer trigger.

### Tests for User Story 2

- [x] T009 [P] [US2] Create Playwright E2E test for mobile responsiveness, bottom bar navigation, and drawer triggers in `apps/web/e2e/mobile-layout.spec.ts`

### Implementation for User Story 2

- [x] T010 [US2] Implement responsive media query breakpoints toggling between desktop sidebar and mobile shell in `apps/web/src/components/AppShell.tsx`
- [x] T011 [US2] Create mobile bottom navigation bar with >= 44x44px touch targets in `apps/web/src/components/AppShell.tsx`
- [x] T012 [US2] Create Vaul drawer menu component with >= 44x44px touch targets in `apps/web/src/components/MobileDrawer.tsx`

---

## Phase 5: User Story 3 - Theme Providers & Palette Compliance (Priority: P2)

**Goal**: Light/dark clinical theme preference mapping and UI tokens application

**Independent Test**: Toggle dark mode provider. Verify CSS variables match design system tokens.

### Tests for User Story 3

- [x] T013 [P] [US3] Create Playwright E2E test checking CSS custom properties changes on theme toggle in `apps/web/e2e/theme.spec.ts`
- [x] T014 [US3] Implement custom theme provider mapping System preference and localStorage in `apps/web/src/components/ThemeProvider.tsx`
- [x] T015 [US3] Integrate ThemeProvider in `apps/web/src/routes/__root.tsx`
- [x] T016 [US3] Override default theme radius in `index.css` to enforce 4px rounded corners (`0.25rem`)

---

## Phase 6: User Story 4 - Global Search Command Palette (Priority: P2)

**Goal**: Command palette dialog triggered by key combination CMD+K or CTRL+K

**Independent Test**: Press CMD+K. Verify command dialog pops up.

### Tests for User Story 4

- [x] T017 [P] [US4] Create Playwright E2E test verifying keyboard shortcut trigger and search filtering in `apps/web/e2e/search.spec.ts`

### Implementation for User Story 4

- [x] T018 [US4] Create search command dialog component in `apps/web/src/components/CommandPalette.tsx`
- [x] T019 [US4] Implement global event listener hook for CMD+K and CTRL+K triggers in `apps/web/src/components/AppShell.tsx`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Performance, linting, and final validations

- [x] T020 [POLISH] Configure Framer Motion layout transitions using spring physics (stiffness 300, damping 30) in `apps/web/src/components/AppShell.tsx`
- [x] T021 Run Biome linter checks on all added/modified components
- [x] T022 Run local Vite build to verify bundle compilation and type checking
- [x] T023 Execute full E2E test suite to verify no regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. Blocks all user stories.
- **User Stories (Phases 3-6)**: Depend on Foundational completion.
- **Polish (Phase 7)**: Depends on all user story phases completion.

### User Story Dependencies

- **US1**: No dependencies.
- **US2**: Integrates with US1 responsive layout hooks.
- **US3**: Applies globally.
- **US4**: Integrates into the main AppShell layout.

### Parallel Opportunities

- All tests for different user stories can be authored in parallel.
- US3 (Theme Provider) and US4 (Command Palette) are highly isolated and can be implemented in parallel.

---

## Parallel Example: User Story 1

```bash
# Author tests and models in parallel
Task: "T005 [P] [US1] Create Playwright E2E test verifying sidebar expand/collapse buttons in apps/web/e2e/desktop-layout.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 & 2 Only)

1. Setup and Foundational layouts ready.
2. Complete US1 (Desktop) and US2 (Mobile).
3. Verify responsive layout toggle works.
4. Stop and demo.
