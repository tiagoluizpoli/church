# Handoff: Mobile Polish Pass (post-021)

**Context**: Spec 021 (`specs/021-mobile-parity-cycles/`) shipped mobile parity for Scheduling > Cycles: mobile card list, add/edit/delete affordances, timezone formatting, nav-drawer hierarchy, desktop bulk expand/collapse. A follow-up bug pass (same session, not tracked in tasks.md) fixed: dropdown-in-drawer click blocking (vaul's `pointer-events: none` body lock), duplicate timezone toggle, mobile header icon order, and missing touch-press feedback on dropdown menu items.

**Already reviewed, out of scope for this pass**: sidebar, mobile top header (icon order/content), nav drawer content (hierarchy, theme toggle, timezone toggle). Don't re-litigate these.

**Ask**: critique + polish the items below. Route: `/impeccable critique` then `/impeccable polish` (or `craft`) against the listed files.

---

## 1. Mobile calendar-review cards

**Where**: Scheduling > Cycles > open a cycle > "Calendar review" section, mobile viewport (<768px).

**File**: `apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx`
Rendered from `apps/web/src/features/scheduling/components/planning-admin/cycle-review-card.tsx` (the `data-testid="planning-events-list"` block).

**What it is**: one card per day/event, each with an inline "Add slot / Edit / Delete" action row, and a slot list beneath with per-slot edit/delete. No critique done on this yet — general pass on layout, spacing, touch target sizing, information hierarchy.

## 2. Edit/Add drawers ("doesn't feel mobile", spacing issues)

**Where**: tapping "Add day-event", "Edit" (day), "Add slot", or "Edit slot" (slot) from the mobile card list above. Opens `ResponsiveFormSurface`, which renders a `Drawer` (bottom sheet) below `md:`.

**Files**:
- Shell: `apps/web/src/components/responsive-form-surface.tsx`
- Drawer primitive (shadcn, installed as-is, don't hand-edit lightly): `apps/web/src/components/ui/drawer.tsx`
- Four consumers reusing the same field markup/footer as their desktop `Dialog` version, now wrapped in the shell instead:
  - `apps/web/src/features/scheduling/components/quick-create-event-modal.tsx` ("New Event")
  - `apps/web/src/features/scheduling/components/planning-admin/edit-event-dialog.tsx` ("Edit day")
  - `apps/web/src/features/scheduling/components/planning-admin/edit-slot-dialog.tsx` ("Edit slot")
  - `apps/web/src/features/scheduling/components/planning-admin/create-slot-dialog.tsx` ("Add slot")

**Known issue**: each of the four consumers renders identical field markup and a `DialogFooter` (from `ui/dialog.tsx`, class `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`) regardless of which shell (`Dialog` or `Drawer`) is active. On mobile this means: no drawer-native footer treatment (no sticky bottom, no `DrawerFooter` padding/border), no larger touch targets, no bottom safe-area inset — it visually reads as "a Dialog's content pasted into a sheet," not a considered bottom-sheet layout. `ResponsiveFormSurface`'s own wrapper div (`overflow-auto px-4 pb-4`) is the only mobile-specific spacing currently applied.

**Open question for critique**: should `ResponsiveFormSurface` pass a render-prop/slot so children can render `DrawerFooter` on mobile vs `DialogFooter` on desktop, or should the footer be normalized into one shared component that adapts?

## 3. Delete confirmation (still a modal everywhere)

**Where**: "Delete day" / "Delete slot" from the mobile card list, and the desktop table.

**Files**:
- Mobile: `apps/web/src/features/scheduling/components/planning-admin/planning-event-card.tsx` (own local `AlertDialog`, decoupled from the desktop table's state — see comment in file)
- Desktop: `apps/web/src/features/scheduling/components/planning-admin/calendar-row.tsx` (`ConfirmDeleteDialogContent`, shared by both parent/day and slot rows)
- Primitive: `apps/web/src/components/ui/alert-dialog.tsx` (base-ui backed, not swapped to `ResponsiveFormSurface`)

**Open question raised**: should delete confirmation move to the same `Drawer`-on-mobile pattern as edit/add, for consistency ("everything should be a drawer")? Or is a small destructive-confirm modal the right pattern regardless of viewport (common convention: confirms stay centered/modal since they're a single yes/no decision, not a form)? Flag for critique rather than assuming an answer.

## 4. Nav drawer entry point vs. slide direction

**Where**: mobile top header, hamburger button (`data-testid="mobile-drawer-trigger"`, top-right) opens the nav drawer, which slides up from the bottom.

**Files**: `apps/web/src/components/app-shell.tsx` (trigger button), `apps/web/src/components/mobile-drawer.tsx` (vaul-based bottom sheet, unrelated to the shadcn `Drawer` in `ui/drawer.tsx` — see spec 021 research.md R1's scope note on why these are two separate components).

**Question raised, not a mandated fix**: trigger sits top-right, but the sheet it opens enters from the bottom — is that a mismatch worth fixing (e.g. move trigger to a bottom corner, or change the drawer's entry direction to match its trigger's position), or is top-right-hamburger-opens-bottom-sheet an acceptable, common-enough mobile pattern? Surface this as a genuine open question in the critique, not a pre-decided direction.

---

## Not in scope for this handoff

Sidebar, mobile top header icon set/order, nav drawer's own content (item hierarchy, connector lines, theme toggle, timezone toggle placement) — all already reviewed and fixed in this session; don't re-flag unless the critique surfaces something genuinely new.
