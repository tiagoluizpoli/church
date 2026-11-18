# Data Model: Mobile Parity & Table Bulk-Expand for Cycles

No new domain entities. This feature is presentation/interaction-layer only, extending state and
component shapes already introduced by specs 013/017/019/020.

## Extended UI State

### `ExpandedCalendarRowsState` (existing, `cycle-review-card.tsx`)

```ts
interface ExpandedCalendarRowsState {
  expandedEventIds: Set<string>;
}
```

No shape change. Two new handler functions operate on it:

- `expandAll(): void` — sets `expandedEventIds` to a `Set` containing every event ID currently listed.
- `collapseAll(): void` — sets `expandedEventIds` to a new empty `Set`.

Both are one-shot actions (spec.md Assumptions) — they do not introduce a persisted "all expanded"
boolean; a subsequent individual row toggle simply mutates the same `Set` as it does today.

## New Component Contracts

### `ResponsiveFormSurfaceProps`

```ts
interface ResponsiveFormSurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}
```

Renders the existing `Dialog`/`DialogContent` shell at `md:` and above, and the newly-installed
standard shadcn `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter` (`apps/web/src/components/ui/drawer.tsx`,
installed via `bunx shadcn@latest add @shadcn/drawer` — see research.md R1) below `md:`, switching
on a small `useMediaQuery('(min-width: 768px)')` hook (`apps/web/src/hooks/use-media-query.ts`),
following shadcn's own documented `drawer-dialog` example pattern. `QuickCreateEventModal`,
`EditEventDialog`, `EditSlotDialog`, and `CreateSlotDialog` each wrap their existing form body in
this surface instead of a bare `Dialog`; the form body's own props (field values, submit handler,
validation) are unchanged.

The existing bespoke nav drawer (`apps/web/src/components/mobile-drawer.tsx`) is a separate,
unrelated component and is not touched by this contract — see research.md R1's Scope note.

### `useMediaQuery` (new hook)

```ts
function useMediaQuery(query: string): boolean;
```

Plain `window.matchMedia`-backed hook, per shadcn's `drawer-dialog` example — not a UI component,
so it is outside the scope of Constitution VI's Mandatory Frontend Rule (which governs UI
components, not utility hooks).

## Reused, Unchanged Shapes

- `CycleCalendarTableRow` / `CycleCalendarSlotRow` (`planning-admin.types.ts`, spec 020) — read
  by both the desktop `calendar-row.tsx` and the mobile `PlanningEventCard`, no shape change.
- `PlanningCycleHeaderModel`, `useTimezone()`'s `format` function — read-only consumption, no
  change.
