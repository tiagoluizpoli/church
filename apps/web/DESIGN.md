---
name: Church CRM
description: Calm, legible scheduling workspace for volunteers and ministry planners.
colors:
  background: "oklch(0.978 0.004 236)"
  foreground: "oklch(0.286 0.032 254)"
  card: "oklch(0.992 0.002 220)"
  card-foreground: "oklch(0.286 0.032 254)"
  popover: "oklch(0.996 0.002 220)"
  popover-foreground: "oklch(0.286 0.032 254)"
  primary: "oklch(0.378 0.09 255)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.962 0.01 240)"
  secondary-foreground: "oklch(0.336 0.028 252)"
  muted: "oklch(0.955 0.008 236)"
  muted-foreground: "oklch(0.48 0.024 250)"
  accent: "oklch(0.948 0.018 247)"
  accent-foreground: "oklch(0.324 0.037 252)"
  destructive: "oklch(0.56 0.207 26)"
  border: "oklch(0.885 0.012 242)"
  input: "oklch(0.902 0.012 242)"
  ring: "oklch(0.532 0.082 254)"
  sidebar: "oklch(0.968 0.01 242)"
  sidebar-accent: "oklch(0.942 0.018 246)"
  status-success: "#16a34a"
  status-warning: "#eab308"
typography:
  headline:
    fontFamily: "Atkinson Hyperlegible, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "Atkinson Hyperlegible, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Atkinson Hyperlegible, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.625
    letterSpacing: "normal"
  label:
    fontFamily: "Atkinson Hyperlegible, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  2xl: "1.125rem"
  3xl: "1.375rem"
  4xl: "1.625rem"
  pill: "999px"
spacing:
  workspace-pad-x: "1rem"
  workspace-pad-y: "1rem"
  workspace-gap: "1rem"
  workspace-panel-pad: "1rem"
  workspace-panel-pad-lg: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "2rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "2rem"
    padding: "0 0.625rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "2rem"
    padding: "0 0.625rem"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "2rem"
    padding: "0 0.625rem"
  input-default:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "2rem"
    padding: "0.25rem 0.625rem"
  button-touch:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "2.75rem"
    padding: "0 1rem"
  input-touch:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "2.75rem"
    padding: "0.5rem 0.75rem"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  switch-checked:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    height: "1.5rem"
    width: "2.75rem"
  switch-unchecked:
    backgroundColor: "{colors.input}"
    rounded: "{rounded.pill}"
    height: "1.5rem"
    width: "2.75rem"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "1.25rem"
    padding: "0.125rem 0.5rem"
---

# Design System: Church CRM

## Overview

**Creative North Star: "The Legible Sanctuary"**

The system serves two very different people in the same building: a volunteer glancing at their phone between errands, and a planner staring at a schedule for twenty minutes deciding who covers Sunday. Both need to trust the tool instantly and read it without strain. That is why Atkinson Hyperlegible, a typeface engineered for low-vision readers, carries every label, button and data point in the app. The choice is load-bearing, not decorative, and the rest of the system follows from it: a tight single-family type scale, a restrained low-chroma blue that never competes with the content, and flat surfaces that stay calm under real scheduling data instead of performing depth for its own sake.

This is not a generic AI-SaaS-cream tool (no tinted-cream backgrounds, no gradient text, no hero-metric tiles), not cartoonish or precious, and not an enterprise-bloated legacy ChMS dashboard. It is a well-run community tool: warm enough to feel human, disciplined enough that a scheduler never has to second-guess whether a save worked.

**Key Characteristics:**
- One typeface (Atkinson Hyperlegible) carries the entire hierarchy. There is no display/body pairing, because product UI doesn't need one.
- A single low-chroma blue (`primary`) is the only saturated brand color; it appears on ≤10% of any screen.
- Surfaces are flat and ring-bordered at rest; shadow is reserved for anything that floats above the page.
- Density flexes by device: compact on desktop admin screens, deliberately larger touch targets on mobile volunteer screens.
- Status color (green/amber plus the `destructive` red) is a separate, literal vocabulary reserved for state: staffing, confirmation and needs-attention notices. It is never brand decoration.
- Motion is rare and informative: data that changes (a count, a bar, a band) eases to its new value over 700ms on one exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), the Home coverage title morphs into the schedule header on navigation, and all of it drops to instant under `prefers-reduced-motion`.
- Forms don't get a mobile-specific redesign; they get a shell swap. `ResponsiveFormSurface` renders the identical form inside a desktop `Dialog` or a mobile `Drawer`, and context promotes every descendant `Button`/`Input` to the 44px `touch` size with no per-screen sizing decisions.

## Colors

Restrained by default: tinted cool-blue neutrals carry almost the entire surface, and the primary blue appears only on primary actions, current selection and the sidebar's active state. All brand tokens are authored in OKLCH in `src/index.css`. The page background is not perfectly flat: a vertical gradient from `background` to `background` mixed 8% toward `accent`, fixed to the viewport (`background-attachment: fixed`, no repeat) so it never tiles below a page shorter than the window. An earlier top-left radial wash was removed: it was invisible in light mode and a grey smear in dark mode. This is the one place a gradient is allowed system-wide: an ambient, whole-page atmosphere, never on text, buttons, or cards.

### Primary
- **Deep Chapel Blue** (`primary`): primary buttons, active nav/sidebar state, the checked `Switch` track, badges that need to read as "the main action," and the selected day in `Calendar`/`DatePickerField`. Never used decoratively or as a background fill beyond low-opacity tints (`/8`, `/11`, `/12`). Text selection uses it mixed 32% with white.

### Neutral
- **Cool Paper** (`background`): page background. A near-white with a faint cool tint toward the primary hue, not a warm cream.
- **Ink Slate** (`foreground`): body text and headings.
- **Chapel Mist** (`card`): card and popover surfaces, a hair lighter than the page so panels lift without a shadow.
- **Quiet Blue** (`secondary`): secondary buttons, badge backgrounds, tab rail.
- **Whisper Gray** (`muted`): disabled states, subtle section backgrounds, hover fills for outline and ghost buttons.
- **Muted Slate** (`muted-foreground`): descriptions, secondary metadata, section descriptions. Lightness is 0.48 (was 0.53) so a 14px section description keeps 4.5:1 on the lifted `.surface-panel`, not only on flat `card`.
- **Hairline Blue** (`border`, `input`): strokes and field borders; `input` also fills the unchecked `Switch` track.
- **Focus Blue** (`ring`): focus borders and focus rings.
- **Sidebar Fog** (`sidebar`): the desktop sidebar and the mobile top header and bottom tab bar. One step cooler than the content area, so the wayfinding chrome reads as its own layer.

### Status (outside the brand palette, by design)
- **Confirmed Green** (`status-success`, Tailwind `green-600`): published-assignment icon, positive suggestion markers. Its text form is `green-700` in light mode and `green-400` in dark mode.
- **Pending Amber** (`status-warning`, Tailwind `yellow-500`): partial or unanswered availability on a suggestion, an assignee who is unavailable or unqualified for the slot. Its text form is `yellow-700` / `yellow-300`. A sibling `amber` family (`amber-500/8` fill, `amber-600`/`amber-700` text) carries needs-attention notices such as "removed from this church" and a usual setup that needs review.
- **Conflict Red** (`destructive`): staffing under 50%, failed assignment writes, destructive actions, unavailable/double-booked conflict chips. Lightness was lowered to 0.56 so it measures 5.1:1 on `card` and 4.85:1 on `background`, passing AA as small text on every surface; at 0.614 it measured 4.05:1 on `card`, and at 0.58 4.46:1 on `background`.

### Dark Mode
Dark mode is a deliberate re-tuning, not a straight invert. `background` drops to a near-black cool slate (`oklch(0.205 0.018 252)`) rather than pure black. `primary` lightens and desaturates to `oklch(0.72 0.066 238)`, because Deep Chapel Blue would fail contrast as a fill on a dark surface, and `primary-foreground` stays dark (`oklch(0.226 0.022 254)`) instead of flipping to white. `card` sits one step lighter than `background` (`oklch(0.24 0.018 252)`) and `sidebar` one step darker (`oklch(0.186 0.016 252)`), so the chrome still reads as its own layer. `destructive` lightens to `oklch(0.682 0.183 24)`. The Staffing Meter fills come from their own `--meter-*` tokens and re-tune per theme (see Staffing Meter), so a fill keeps 3:1 against its track and surface in both.

### Named Rules
**The One Voice Rule.** Deep Chapel Blue is the only saturated brand color and it never exceeds roughly 10% of a screen's surface. Reach for a neutral tint (`/8`–`/15` opacity) before reaching for a stronger blue.

**The Traffic-Light Exception.** Green and amber are the one place the system intentionally steps outside the OKLCH brand ramp and uses literal Tailwind palette colors. This is deliberate: staffing and confirmation state must read instantly to an anxious admin or an older volunteer, and a brand-tinted "success" would blunt that. Use them only for staffing meters, availability confirmation and needs-attention notices; red always comes from the `destructive` token, never a raw `red-*`.

## Typography

**Body/UI Font:** Atkinson Hyperlegible (with sans-serif fallback), loaded from Google Fonts at weights 400 and 700 only.
**Mono Font:** JetBrains Mono (with monospace fallback), weights 400–700. Used for timestamps, keyboard hints and audit-log/technical detail only.

**Character:** One accessibility-first sans carries the whole interface (headings, labels, buttons, body, data) at a tight scale. Atkinson Hyperlegible was designed by the Braille Institute to keep letterforms distinguishable at small sizes for low-vision readers, which is exactly the population this app can't afford to lose.

### Hierarchy
- **Headline** (600, 1rem/16px, 1.25 line-height): section titles (`.workspace-section-title`) and drawer/dialog section headers.
- **Title** (500, 0.875rem/14px, 1.3 line-height): card titles, dialog titles, the "Church CRM" wordmark.
- **Body** (400, 0.75rem/12px, 1.625 line-height): default UI copy, card content, table content. Section descriptions step up to 0.875rem at 1.6 line-height and cap at 72ch.
- **Label** (500, 0.75rem/12px, 1 line-height): nav links, badges, tabs, buttons. Touch-size buttons and inputs step up to 0.875rem.
- **Lead** (400, 1.125rem/18px, snug): the one place type steps above Headline, on Home only: the attention line's sentence, and the stage counts in the cycle band (at 600, tabular figures).
- **Mono** (400, 0.75rem/12px): audit log entries, timestamps, the `⌘K` hint chip (0.65rem).

Only 400 and 700 of Atkinson Hyperlegible are loaded, so the browser renders the authored 500 as 400 and the authored 600 as 700. Labels and titles therefore read regular in practice, and headlines read bold. Treat this as the real rendered hierarchy until a 500/600 cut is added. The family on Google Fonts ships only 400 and 700.

### Named Rules
**The One-Family Rule.** Product UI does not get a display/body pairing. Atkinson Hyperlegible carries every weight of the hierarchy; a second family "for impact" would undercut the legibility mandate that is the point of the system.

## Layout

The shell is a fixed sidebar plus a scrolling workspace on desktop, and a sticky header plus bottom tab bar on mobile. The switch happens at `768px` (`md`).

- **Desktop sidebar:** 240px expanded, 64px collapsed, animated on a spring (`stiffness 300, damping 30`). The desktop top bar and the sidebar head are both 64px tall (`h-16`).
- **Mobile chrome:** a 64px sticky top header (`z-40`, `sidebar/95` with backdrop blur) and a fixed bottom tab bar. Toasts on mobile are offset 80px from the top so they clear the header.
- **Workspace rhythm:** pages use `.workspace-page`, a single column whose sections are separated by `workspace-gap` (1rem). Page padding is responsive: `workspace-pad-x` is 1rem on mobile (a 16px phone gutter), 1.25rem from 768px, and 1.5rem from 1280px; `workspace-pad-y` is 1rem, then 1.25rem from 768px. Panels pad at `workspace-panel-pad` (1rem) or `workspace-panel-pad-lg` (1.25rem, then 1.5rem from 1280px).
- **Section headers:** title and description stacked with a 0.5rem gap (`.workspace-section-header`); descriptions never run wider than 72ch.
- **Density:** desktop controls are 32px tall with `text-xs`; mobile sheets and volunteer controls are 44px with `text-sm`. The density shift is driven by `FormControlSizeProvider`, not by per-screen breakpoints.

### Named Rules
**The Sections-Not-Cards Rule.** Group content into flat workspace sections separated by `workspace-gap`. Reach for `.surface-subtle` for a nested group instead of nesting a second Card.

## Elevation & Depth

Flat by default, ring-bordered instead of shadowed at rest. Cards, panels and inputs use a 1px `ring-foreground/10` or `border` to separate from the background, never a resting shadow. Shadow is reserved for layers that detach from the page flow, and its strength scales with how far that layer floats. Full-bleed sheets (`Drawer`, `MobileDrawer`) are the deliberate exception: they carry no shadow, only a `border-t`, because a bottom sheet is flush with the viewport edge and has no page beneath that edge for a shadow to fall onto.

### Shadow Vocabulary
- **Ambient badge** (`shadow-sm`): icon badges in the sidebar/header, the active sidebar nav row.
- **Floating panel** (`shadow-md`, paired with `ring-1 ring-foreground/10`): popovers, dropdown menus, select menus, the `Calendar` popup inside `DatePickerField`.
- **Floating panel, elevated** (`shadow-lg`): the deepest dropdown-menu submenu tier, a volunteer card while being dragged.
- **Modal peak** (`shadow-xl`): the command palette, the highest layer in the app.
- **Flush sheet** (no shadow, `border-t` only): `Drawer` and `MobileDrawer` bottom sheets.
- **Native-field fallback** (`0 1px 2px` at 6% foreground): only on unstyled native `input`/`select`/`textarea` elements that don't come from `@/components/ui`. Every design-system field is flat.

### Stacking Order
A four-tier z-index scale, lowest to highest: in-component layers such as sticky action bars, select scroll arrows and the drawer handle (`z-10`) → mobile top header / bottom tab bar (`z-40`) → dialogs, drawers, popovers, selects, tooltips, command palette (`z-50`) → dropdown menus (`z-60`). Dropdown menus sit one tier above everything else on purpose. A `DropdownMenu` (for example the user menu) can be triggered from inside an open `Drawer`, and the drawer library sets `pointer-events: none` on `<body>` while open. A menu at the same `z-50` would inherit that lock and silently swallow clicks.

### Named Rules
**The Grounded-Until-Floating Rule.** Apart from the Ambient badge, a surface earns a shadow only when it has left the document flow (popover, dropdown, dialog, command palette). Cards, panels and list rows stay flat and use a ring or border. Depth means "this is temporary and overlaid," not "this is important." Flush sheets are the second carve-out: `border-t` does the job a shadow does everywhere else.

**The Escalation Rule.** A floating menu or popup always out-ranks any sheet it can be opened from. `DropdownMenu` is pinned to `z-60`, one tier above the `z-50` shared by dialogs, drawers, popovers, selects and tooltips, so it stays interactive inside an open `Drawer`.

## Shapes

Gently rounded, never bubbly. Every radius derives from one base (`--radius`, 0.625rem/10px) and is applied through role utilities, never raw `rounded-*` classes:

- **Control** (`.radius-control`, 8px): buttons, inputs, badges, calendar day cells, avatars, icon chips (`.radius-icon` is the same 8px).
- **Check** (`.radius-check`, 4px): checkboxes. At the control radius a 16px box reads as a radio button.
- **Surface** (`.radius-surface`, 10px): `Card` and in-flow containers.
- **Floating** (`.radius-floating`, 10px): popovers, menus and dialogs.
- **Panel** (`.surface-panel`, 14px): the gradient-lifted section panel is one step rounder than a Card.
- **Sheet top** (`.radius-sheet-top`, 14px top corners only): bottom-sheet drawers.
- **Pill** (`.radius-pill`, 999px): the `Switch` track and thumb and the drawer grab handle. Pills are reserved for toggles and handles; buttons and badges stay at the control radius.

Avatars are square at the control radius, a deliberate break from the base-ui default circle so they match every other control.

### Named Rules
**The Role-Radius Rule.** Pick the radius by role (control, surface, floating, sheet, pill), not by eye. A new component that needs a corner uses a `.radius-*` utility.

## Components

Sourced from shadcn/ui, ported onto `@base-ui/react` primitives (not Radix), with `class-variance-authority` for variants and Tailwind v4's CSS-first `@theme` for tokens. Every interactive primitive lives under `@/components/ui` and is consumed identically across the volunteer and admin surfaces: the same button is the same button everywhere. `Calendar` is shadcn's calendar block re-pointed at `react-day-picker` and this system's tokens; `Drawer` is shadcn's drawer pattern re-pointed at `@base-ui/react/drawer` instead of `vaul`. All built-in UI copy in these primitives (screen-reader labels, table loading/empty text) comes from the Paraglide message catalogue, never hardcoded English.

### Named Rules
**The Shadcn-First Rule.** No new UI primitive is built from scratch if shadcn/ui already ships it. Pull the shadcn block or primitive, re-skin it onto this system's tokens, and swap its primitive to base-ui.

### Buttons
- **Shape:** control radius (8px).
- **Sizes:** `xs` (24px) / `sm` (28px) / `default` (32px) / `lg` (36px) / `touch` (44px, `text-sm`), with matching icon sizes (`icon-xs`…`icon-lg`, `icon-touch`). Desktop-dense by default; `touch` and `icon-touch` exist for mobile sheets and volunteer-facing controls.
- **Primary:** solid Deep Chapel Blue with `primary-foreground` text. A primary rendered as a link (`<a>`) dims to `primary/80` on hover; a primary `<button>` has no hover fill change.
- **Outline:** `background` fill with a `border` stroke, hover to `muted`. **Secondary:** `secondary` fill, hover to `secondary/80`. **Ghost:** transparent, hover to `muted`. **Link:** `primary` text, underline on hover.
- **Destructive:** a soft `destructive/10` tint with red text at rest, `destructive/20` on hover. It doesn't read as an alarm until interacted with.
- **Focus:** border shifts to `ring` plus a solid 2px `ring` ring set 2px off the control on a `background` gap, consistent across variants, so focus on a filled primary still measures above 3:1. Disabled is 50% opacity with pointer events off.
- **Context-driven sizing:** a `Button` with no explicit `size` reads `FormControlSizeProvider` context and resolves to `touch` inside a mobile sheet, `default` everywhere else.

### Badges
- **Style:** 20px tall, control radius, `text-xs` medium. Used for counts (unread tabs), staffing percentages and conflict labels.
- **Variants:** default (primary fill), secondary, destructive, outline, ghost: the same vocabulary as buttons. Focus uses a wider 3px `ring/50` ring than buttons.
- **Cancelled:** a cancelled Event or time block always carries the `destructive` badge with Planning's "cancelled" label (`CancelledBadge`), so the builder, Prepare and Planning say it the same way.

### Avatars
- **Shape:** square at the control radius.
- **Style:** initials-only `AvatarFallback` on a `primary/12` tint with `primary` text; no photo avatars in the current build.
- **Sizes:** `sm` / `default` / `lg` via `data-size`, each with a matching fallback type step.

### Cards / Containers
- **Card:** surface radius (10px), `card` background, `ring-1 ring-foreground/10` instead of a stroke, `text-xs` relaxed body. Vertical padding 1rem with a 1rem internal gap; the `size="sm"` variant drops to 0.75rem and 0.5rem. Images flush to the top edge inherit the corner.
- **`.surface-panel`:** the section-level panel. 14px radius, 1px `border` mixed 12% toward white, and a top-to-bottom lift from `card` mixed 86% with white to plain `card`, in place of a shadow.
- **`.surface-subtle`:** a flatter, recessed 10px container (`card` mixed 58% with white) for nested or secondary content. Use it instead of nesting a second Card.

### Inputs / Fields
- **Style:** control radius, 32px tall, 1px `input` border, `text-xs`. Inside `FormControlSizeProvider size="touch"` they become 44px with `text-sm`, the same automatic promotion as `Button`.
- **Focus:** border shifts to `ring`, plus a 1px ring glow. Focus is never signalled by color alone.
- **Placeholder:** deliberately darker than the usual washed-out gray, so it keeps body-text contrast.
- **Error:** `destructive` border and ring, in both themes.

### Checkbox
- **Shape:** a 16px box at the check radius (4px), never the control radius, so it can't be mistaken for a radio.
- **Colors:** the unchecked border is `muted-foreground`, so the box measures at least 3:1 against `card` and `background`; checked fills `primary` with a `primary-foreground` tick.
- **Hit area:** an `after` overlay extends it 12px sideways and 8px vertically; mobile rows wrap it in a 44px cell.

### Switch
- **Shape:** a 44×24px pill track with a 20px pill thumb that slides 20px when checked. An invisible `after` overlay extends the hit area 10px above and below, giving a 44px-tall touch target without enlarging the visual.
- **Colors:** unchecked track is `input` with an `input` border; checked track and border are `primary`. The thumb is `background`.
- **States:** focus shifts the border to `ring` with a 1px `ring/50` ring; disabled is 50% opacity with a not-allowed cursor. The thumb slide is disabled under `prefers-reduced-motion`.
- **Use:** a per-row on/off answer inside a list, such as "available" for each shift on the volunteer availability page. Each switch sits in a label with a 44px minimum height and edits a local draft; a sticky full-width `touch` Save button commits the whole list.

### Date & Calendar
- **Calendar:** a flat `background` panel with no card chrome of its own. It always sits inside a `Popover` or a form surface. Day cells are 32px squares at the control radius, nav chevrons are ghost icon buttons, and the month/year dropdown is a bordered control matching every other input, not a bare native `<select>`.
- **Selected state:** a selected day fills solid Deep Chapel Blue with white text, the same treatment as a primary button.
- **DatePickerField:** an outline `Button` trigger (calendar icon plus the formatted date or a placeholder) that opens the `Calendar` in a `Popover`, replacing the OS date picker so the calendar matches the rest of the system in both themes.

### Lists & Tables
- **DataTable:** renders as a `listbox` only when a selection mode is set; otherwise it is a plain `list` with `listitem` rows and an `aria-label`. Loading and empty states default to localized one-line messages. The actions column (`actionsColumnId`, default `actions`) keeps its title for screen readers only; pass `hideName: false` to show it. A focused cell shows an inset 2px `ring` and a focused row an inset 2px `primary` outline, never color alone.

### Sheets & Overlays
- **Dialog:** floating radius, `popover` fill, `ring-1 ring-foreground/10`, a 100ms fade-and-zoom in and out. Tab wraps from the last control to the first (and Shift+Tab back) immediately, so a fast second Tab can't escape to the page behind. When the footer already has its own "Close", the × takes a different accessible name (`closeLabel`).
- **Drawer (base-ui):** the mobile counterpart to `Dialog`, used directly and via `ResponsiveFormSurface`. Bottom sheet by default (`swipeDirection="down"`), sheet-top corners, a pill grab handle, and no shadow (see Elevation & Depth).
- **ResponsiveFormSurface:** the standard shell for any form that must work on both a desktop admin screen and a mobile volunteer screen. It renders `Dialog` at `≥768px` and `Drawer` below it for the same `children`. The footer (Save/Cancel) renders outside the mobile scroll region so the primary action stays in thumb reach, and the mobile branch wraps its content in `FormControlSizeProvider size="touch"`. The drawer's close affordance is a dedicated 44px ghost icon button, top-right, not the swipe handle alone. While a save is in flight, `closeDisabled` holds every way out (×, Escape, overlay click, swipe), so an edit can't be discarded mid-save. The template editor dialog also asks before leaving with unsaved changes.
- **Toasts (Sonner):** `bottom-right` on desktop, `top-center` on mobile, with the mobile offset pinned at 80px so a toast never lands under the sticky header.

### Signed-out frame (`AuthShell`)
Sign-in, forgot-password and reset-password share one frame: a wide brand panel and a narrow form column (28rem from 1024px, 32rem from 1280px), but only on a screen that is both 1024px+ wide and landscape (the frame's rules live in `src/first-paint.css`, shared with the boot shell below). Everything else stacks: phones, landscape phones and every portrait tablet (iPad Mini, Surface Pro, iPad Pro 13), because a tall portrait panel crops the windows and inflates the lectern. Stacked, the form takes only the height it needs at the bottom of the screen (in thumb reach) and the scene band fills everything above it (at least 12rem), so there is no dead space below the form; the band keeps the brand mark top-left and the tagline bottom-left, as the panel does. From 640px the form widens to 28rem and centres horizontally. Bands up to 2.4:1 keep the close shot of the windows and the Bible; only a wider one (a landscape phone) switches to a framing of just the windows. Every control in the form is `touch`-sized. Sign-in failures render inline (`role="alert"`, `destructive`) above the submit button, never as a toast, and a successful sign-in shows no toast: arriving in the app is the confirmation.

The panel is always dark (it carries `.dark`; `.auth-panel.dark` restates the colour tokens because `@theme` resolves them at `:root`) and holds the brand mark, the tagline "Tudo o que a igreja organiza, em um só lugar." and `SanctuaryLightScene`: a WebGL2 church interior with three round-arched windows in a smooth plaster wall, warm sunlight falling through them onto an open Bible on a wooden lectern. One window mask and one sun direction drive the glass, the beams, the floor patches and the shadows, so light and windows always agree. The frames are neutral (one mullion, two transoms): no cross or other symbol beyond the Bible, so the scene suits any church tradition.

It is built to be light on any hardware: the scene and its light shafts are baked once (progressively, at an adaptive pixel ratio), and each frame only composites them with a slow light swell, drifting haze and dust, capped at 30fps and paused when hidden. The pointer never moves the scene; where it passes through a beam the air glows slightly and the dust swirls away. The panel paints a still image of the scene's real first frame first (one of four crops, picked by the panel's shape); only once that still is on screen and the page is idle does the live scene load, and it crossfades in over the still once it has drawn the same frame. Anything that makes the animation a poor bet keeps the still for good: reduced motion, no WebGL2, Save-Data, a slow connection (2G/3G), under 4 GB of memory or 4 CPU cores, or a scene not ready within 4 s. The tagline and brand mark sit on darkened corners to keep 4.5:1.

Before any script or stylesheet arrives, `index.html` paints a boot shell of this frame on the three signed-out routes: the theme's page background, the panel with its still, and the form outlined in soft bars (the form's own copy set in transparent text with a tinted background, outlined fields, a tinted button bar) that pulse gently and hold steady under reduced motion. It follows the theme and the locale the app will resolve, lands exactly where the real form will, and goes in the same frame AuthShell paints, so the form fills in rather than appears; a start that fails takes it away instead of leaving it over the page.

`GatheringScene` (people drifting into small groups) is kept dormant for the future cells feature and is not rendered.

### Navigation
- **Desktop sidebar:** collapsible (240px ↔ 64px). The active item gets a `primary/11` tinted background with a solid `primary` icon chip; inactive items are `sidebar-foreground/78`.
- **Nested nav (for example Scheduling's Planning / Prepare / Builder):** when expanded, a thin `sidebar-foreground/25` tree stem runs down the left edge with a stub to each child row, a literal parent/child hierarchy rather than a second tab bar. When collapsed, the tree drops and child icons stack as an icon rail with tooltips.
- **Mobile:** a sticky top header (search, notifications, menu) and a fixed bottom tab bar, both in the `sidebar` tone and both with 44px+ touch targets.
- **Sub-navigation (for example Scheduling tabs):** an underline indicator that scales from `scale-x-0` to `scale-x-100` under the active label, not a filled pill.
- **Breadcrumbs:** desktop-only, derived from the route path. Opaque IDs (UUIDs) are dropped from the trail unless the segment resolves to a real name through live data, such as a cycle ID rendering as the cycle's name once fetched.

### Home: attention line and cycle band
Home is ordered by what needs attention, not by widget type.

- **Attention line ("Agora"):** the one thing Home asks for first, as a sentence and a single `touch` action. When there is something to do, it sits on a surface-radius band with a `primary/8` fill and a `ring-1 ring-primary/15` stroke, the heading beside a Lead-size sentence. It is the only primary-tinted panel on the page. When nothing is pending it collapses to a flat line: the heading and a muted check icon with a calm sentence, no fill, no ring. A volunteer who serves never sees the calm line, because their serving section already says it.
- **Cycle band:** a 10px `muted` timeline track at the control radius. The current cycle sits on it as a `primary/25` span filled to today in `primary/70`, the next cycle as a `primary/12` span with an inset `ring-primary/35` stroke, and today as a 2px `foreground` tick with a small "today" label above it. Below the track, one bar per schedule stage (to prepare, asking, assigning, published) stepping up in blue strength (`primary/25`, `/50`, `/75`, solid) as a schedule nears publication; an empty stage's bar is `muted`. Each bar's width grows with its count, each with its label and a Lead-size count, the whole row a link into Schedules filtered to that stage.
- **Counting numbers (`AnimatedNumber`):** a Home number that changes after first paint counts from the value on screen to the new one over 700ms. The count runs in an `aria-hidden` twin; the real text is always the final value, so a screen reader never hears an in-between number. Never animates on first load, never under reduced motion.

**The Final-Text Rule.** Animation decorates a value, it never stands in for it. The DOM text a reader or test sees is the settled value from the first frame; any counting, growing or morphing happens on an `aria-hidden` twin or on layout alone.

### Staffing Meter (signature component)
A dedicated component with two renderings: a compact percentage `Badge` per event-time-block and a full `Progress` bar per event, both colored by the status vocabulary. The bar fills from `--meter-danger` under 50%, `--meter-warning` from 50–99% and `--meter-success` at 100% (`bg-meter-*`): `destructive`, `yellow-700` and `green-700` in light mode, `destructive`, `yellow-400` and `green-500` in dark, chosen so each fill measures at least 3:1 against the `muted` track and the `card`/`popover` surface (the lighter `yellow-500`/`green-600` fell to about 2:1 and 2.8:1 in light mode). A slot with no requirement shows a neutral `muted-foreground/30` bar. In the proposal review, the meter shows a change: it fills to the result, with a 2px notch where the board stands today. This is the main home of the Traffic-Light Exception. On the Home dashboard the meter runs softened: the same three hues at 60–70% opacity (bar and coverage ring alike), with the open-spot count as plain muted text, so a page of meters reads calm rather than loud.

## Do's and Don'ts

### Do:
- **Do** carry every UI surface in Atkinson Hyperlegible; it's the accessibility commitment the whole system is built on.
- **Do** keep `primary` to ≤10% of any screen; reach for opacity tints (`/8`–`/15`) before a solid fill.
- **Do** keep cards, panels and list rows flat with `ring-1 ring-foreground/10` or a `border`; reserve shadow for popovers, dropdowns, dialogs and the command palette.
- **Do** use green and amber only for staffing, availability confirmation and needs-attention notices, and take red from the `destructive` token.
- **Do** size touch targets at 44px+ on mobile and volunteer-facing controls, even when the desktop control is 32px. Use the `touch`/`icon-touch` size, wrap the region in `FormControlSizeProvider`, or extend the hit area the way `Switch` does.
- **Do** pick corners from the `.radius-*` role utilities.
- **Do** give `DropdownMenu` a higher z-index (`z-60`) than any dialog, drawer, popover, select or tooltip (`z-50`) it might be triggered from, per the Escalation Rule.
- **Do** reuse local `@/components/ui` primitives (Button, Card, Badge, Input, Switch, Dialog, Tabs) rather than one-off styled elements.
- **Do** build every new component on shadcn/ui, re-skinned onto this system's tokens and swapped to `@base-ui/react`.
- **Do** re-tune colors for dark mode rather than inverting them, and re-check AA contrast for any token you change (the `destructive` lightness change is the precedent).
- **Do** source every built-in label, including screen-reader-only text, from the i18n message catalogue.
- **Do** animate only value changes, with the shared 700ms `cubic-bezier(0.16, 1, 0.3, 1)` ease-out, and drop to instant under `prefers-reduced-motion`.

### Don't:
- **Don't** introduce a cream, sand or warm-tinted body background; the app background is a cool near-white.
- **Don't** use gradient text, hero-metric tiles, side-stripe colored borders or tiny uppercase eyebrow labels; none appear in the system and they don't fit a task-focused product.
- **Don't** add a second display typeface "for hierarchy." One family, weight and size do the work.
- **Don't** put a resting shadow on an in-flow surface (card, panel, table row) or on a full-bleed bottom sheet.
- **Don't** use raw `red-*` classes or use status colors for anything decorative or unrelated to state.
- **Don't** ship a component with only a default state; every interactive control needs hover, focus-visible, disabled and, where relevant, loading and error states.
- **Don't** carry admin density (32px controls, `text-xs` everywhere) into volunteer-facing mobile flows without upsizing touch targets first.
- **Don't** use a pill radius on buttons or badges; pills are for toggles and handles.
- **Don't** build a bespoke mobile-vs-desktop form component; reuse `ResponsiveFormSurface` for the `Dialog`↔`Drawer` swap.
