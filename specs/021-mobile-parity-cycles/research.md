# Research: Mobile Parity & Table Bulk-Expand for Cycles

## R1: Mobile add/edit/delete surface for day-events and slots

**Decision**: Install the **standard shadcn `drawer` component** (`registry:ui`, `bunx shadcn@latest add @shadcn/drawer` → `apps/web/src/components/ui/drawer.tsx`, vaul-based) and build `ResponsiveFormSurface` by following shadcn's own documented `drawer-dialog` example verbatim: render the existing `Dialog`/`DialogContent` at `md:` and up, and the newly-installed `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter` below it, switching on a small `useMediaQuery` hook (added at `apps/web/src/hooks/use-media-query.ts`, per the same example — a plain `window.matchMedia` hook, not a UI component). `QuickCreateEventModal`, `EditEventDialog`, `EditSlotDialog`, and `CreateSlotDialog` each swap their outer `Dialog`/`DialogContent` for `ResponsiveFormSurface`; their internal form field markup is reused unchanged.

**Rationale**: Constitution VI's Mandatory Frontend Rule (`manual-planning/0001-volunteer-scheduling/specifications-list.md:57-61`) requires starting from an existing shadcn/ui component and forbids hand-building one that isn't in the standard registry. Verified via the project's shadcn MCP tooling (`search_items_in_registries`, `view_items_in_registries`) that `drawer` (registry:ui) and `drawer-dialog` (registry:example — literally shadcn's own "responsive dialog" recipe) both exist in the `@shadcn` registry, so no custom invention or user escalation is needed. This **supersedes an earlier draft of this decision** that proposed generalizing the codebase's existing bespoke `apps/web/src/components/mobile-drawer.tsx` (a hand-rolled `vaul` wrapper, not itself sourced from the shadcn registry) — that path would have violated the Mandatory Frontend Rule by extending a non-standard component instead of installing the standard one. `vaul` is already a project dependency (via the existing bespoke drawer), so installing the standard `drawer` component adds no new package.

**Scope note**: The existing nav drawer (`mobile-drawer.tsx`, used by `app-shell.tsx`, predates this feature) is left untouched by this decision — this feature only needs a mobile form shell for US1's new add/edit/delete surfaces, and migrating the already-shipped nav drawer onto the new standard `Drawer` is out of scope (spec.md's FR-007/US4 explicitly scopes the nav drawer's work to visual restyling only, no primitive change).

**Alternatives considered**: (a) Generalize `mobile-drawer.tsx` — rejected per the Constitution VI violation above. (b) Build a second, mobile-only `Dialog` with `sm:max-w-full` styling — rejected, doesn't solve small-viewport ergonomics and isn't a distinct shadcn primitive either. (c) Route to a full mobile page per action — rejected, breaks the "manage from the review screen" flow spec 020 established and adds new routes for what's fundamentally a modal-editing pattern.

## R2: Theme toggle not working on mobile

**Decision**: The root cause is a nested-portal z-index collision — `ModeToggle`'s `DropdownMenuContent` (`apps/web/src/components/ui/dropdown-menu.tsx`) and `MobileDrawer`'s `Drawer.Overlay`/`Drawer.Content` (`mobile-drawer.tsx:18,21`) both use `z-50` and both portal to `document.body`; when the dropdown opens from inside an already-open drawer, DOM insertion order (not explicit z-index) decides stacking, and the drawer's overlay can end up rendering above the dropdown content, intercepting the tap before it reaches a menu item. Fix: raise `DropdownMenuContent`'s z-index above the drawer's (e.g. `z-[60]`) so any dropdown opened from within the drawer always stacks above it, regardless of DOM order. Apply the same bump defensively to any other dropdown-based control rendered inside the drawer (`TimezoneToggle`, if it shares the same `DropdownMenu` primitive) to prevent the identical bug recurring there.

**Rationale**: Matches every symptom reported (works on desktop where no drawer overlay is present; login and other overlay-free flows are unaffected; "selecting an option has no visible effect" matches a click being swallowed by an overlay above the real target). A z-index bump is a one-line, low-risk fix with no behavior change outside the nested-overlay case.

**Alternatives considered**: Rendering `ModeToggle`'s dropdown content inside the drawer's own portal container instead of `document.body` — rejected as a larger, riskier change to a shared primitive (`dropdown-menu.tsx`) used across the whole app, when a scoped z-index bump resolves the specific collision.

## R3: Table bulk expand/collapse

**Decision**: Extend the existing `calendarRowsState` (`useState<ExpandedCalendarRowsState>({ expandedEventIds: new Set() })`, `cycle-review-card.tsx:152-153`) with two new handlers — `expandAll` (sets `expandedEventIds` to the full set of the currently-listed event IDs) and `collapseAll` (resets it to an empty `Set`) — surfaced as two buttons ("Expand all" / "Collapse all") in the desktop table's toolbar area (the `hidden md:block` section spec's FR-008/FR-009 scope this to desktop).

**Rationale**: Reuses the exact state shape `toggleEventExpanded` already manages — no new state model, no behavior divergence between a bulk action and N individual taps.

**Alternatives considered**: A single stateful "Expand all / Collapse all" toggle button whose label flips based on whether all rows happen to be expanded — rejected per spec.md's Assumptions (ambiguous once a user manually re-collapses one row after a bulk expand); two explicit one-shot buttons avoid that ambiguity entirely.

## R4: Mobile timezone-formatting parity

**Decision**: `TimezoneProvider` already wraps the entire route tree (`apps/web/src/main.tsx:14-22`), so `useTimezone()` is already available anywhere. `PlanningEventCard` (`apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx`), the mobile card list currently rendered as a static summary with no formatting logic, is updated to call the same `format(row.startDate, 'PP')` / `format(slot.startTime, 'p')`–`format(slot.endTime, 'p')` pattern `calendar-row.tsx` already uses for the desktop table (spec 020 US2), reading from the same `CycleCalendarTableRow`/`CycleCalendarSlotRow` shape — no new data shape, no new formatting utility.

**Rationale**: Spec 020 already solved this exact formatting problem for desktop; mobile just needs the same read, applied to different markup. Reusing the identical `format(...)` calls guarantees the two viewports never drift out of sync on formatting rules.

**Alternatives considered**: None — this is a direct port of already-shipped, already-correct logic.

## R5: Mobile nav drawer hierarchy redesign

**Decision**: Keep the drawer's existing always-expanded, non-interactive nesting (no new collapse/expand behavior — out of scope per spec.md FR-007's "preserve exact same behavior"). Replace the current `pl-10`-only indentation (`app-shell.tsx:669-694`) with an explicit hierarchy treatment: a left connector rule (`border-l`) running alongside the child group, a muted/uppercase section label style for the parent item when it has children, and slightly tighter vertical rhythm between siblings — a purely visual change to the same markup structure (same `NavItem`/`children` data, same `Link`/route targets, same active-state class logic).

**Rationale**: Matches common mobile-drawer conventions (e.g. a connector line is the most legible way to say "these belong to that" without adding interaction complexity or changing navigation), and satisfies FR-007 without touching route/active-state logic at all.

**Alternatives considered**: Making sections collapsible (accordion-style) — rejected, that's a behavior change spec.md explicitly scoped out ("same behavior... this is a visual/IA polish, not a behavior change").
