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
  muted-foreground: "oklch(0.53 0.024 250)"
  accent: "oklch(0.948 0.018 247)"
  accent-foreground: "oklch(0.324 0.037 252)"
  destructive: "oklch(0.614 0.207 26)"
  border: "oklch(0.885 0.012 242)"
  input: "oklch(0.902 0.012 242)"
  ring: "oklch(0.532 0.082 254)"
  sidebar: "oklch(0.968 0.01 242)"
  sidebar-accent: "oklch(0.942 0.018 246)"
  status-success: "#16a34a"
  status-warning: "#eab308"
  status-danger: "#dc2626"
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
  workspace-pad-x: "0.75rem"
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
  button-primary-hover:
    backgroundColor: "{colors.primary}"
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
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "1.25rem"
    padding: "0.125rem 0.5rem"
---

# Design System: Church CRM

## 1. Overview

**Creative North Star: "The Legible Sanctuary"**

The system exists to serve two very different people in the same building: a volunteer glancing at their phone between errands, and a planner staring at a roster for twenty minutes deciding who covers Sunday. Both need to trust the tool instantly and read it without strain — hence Atkinson Hyperlegible, a typeface literally engineered for low-vision readers, carrying every label, button, and data point in the app. That choice is not decorative; it is the load-bearing decision the rest of the system is built around. Everything else follows from it: a tight, single-family type scale, a restrained low-chroma blue that never has to compete with the content, and flat surfaces that stay calm under real scheduling data instead of performing depth for its own sake.

This is explicitly not a generic AI-SaaS-cream tool (no tinted-cream backgrounds, no gradient text, no hero-metric tiles), not cartoonish or precious, and not an enterprise-bloated legacy ChMS dashboard. It is a well-run community tool: warm enough to feel human, disciplined enough that a scheduler never has to second-guess whether a save worked.

**Key Characteristics:**
- One typeface (Atkinson Hyperlegible) carries the entire hierarchy — no display/body pairing, because product UI doesn't need one.
- A single low-chroma blue-violet (`primary`) is the only saturated brand color; it appears on ≤10% of any screen.
- Surfaces are flat and ring-bordered at rest; shadow is reserved for anything that floats above the page.
- Density flexes by device: compact on desktop admin screens, deliberately larger touch targets on mobile volunteer screens.
- Status color (green/yellow/red) is a separate, literal vocabulary reserved strictly for staffing and confirmation state — never for brand decoration.

## 2. Colors

Restrained by default: tinted cool-blue neutrals carry almost the entire surface, with the primary blue-violet appearing only on primary actions, current selection, and the sidebar's active state. The page background is not perfectly flat: a faint radial wash of the `accent` hue sits in the top-left corner and fades into the base `background` by the bottom edge (`color-mix` in OKLCH, ≤56% strength). This is the one place a gradient is allowed system-wide — an ambient, whole-page atmosphere, never on text, buttons, or cards.

### Primary
- **Deep Chapel Blue** (`oklch(0.378 0.09 255)`): primary buttons, active nav/sidebar state, focus accents, badges that need to read as "the main action." Never used decoratively or as a background fill beyond low-opacity tints (`/8`, `/11`, `/12`).

### Neutral
- **Cool Paper** (`oklch(0.978 0.004 236)`, `background`): page background. A true near-white with a faint cool tint toward the primary hue, not a warm cream.
- **Ink Slate** (`oklch(0.286 0.032 254)`, `foreground`): body text and headings.
- **Chapel Mist** (`oklch(0.992 0.002 220)`, `card`): card and popover surfaces, a hair lighter than the page so panels lift without a shadow.
- **Quiet Blue** (`oklch(0.962 0.01 240)`, `secondary`): secondary buttons, badge backgrounds, tab rail.
- **Whisper Gray** (`oklch(0.955 0.008 236)`, `muted`): disabled states, subtle section backgrounds, hover fills.
- **Sidebar Fog** (`oklch(0.968 0.01 242)`, `sidebar`): the desktop sidebar and mobile top/bottom nav surfaces — one step cooler than the content area so the wayfinding chrome reads as its own layer.

### Status (outside the brand palette, by design)
- **Confirmed Green** (`#16a34a`): staffing at 100%, confirmed assignment icon.
- **Pending Amber** (`#eab308`): staffing 50–99%, pending confirmation icon.
- **Conflict Red** (`#dc2626` / `destructive` `oklch(0.614 0.207 26)`): staffing under 50%, declined assignment, destructive actions, unavailable/double-booked conflict chips.

### Dark Mode
Dark mode is a deliberate re-tuning, not a straight invert. `background` drops to a near-black cool slate (`oklch(0.205 0.018 252)`) rather than pure black, and `primary` lightens and desaturates to `oklch(0.72 0.066 238)` — Deep Chapel Blue would fail contrast as a fill on a dark surface, so its dark-mode counterpart is a lighter, quieter blue that keeps `primary-foreground` dark (`oklch(0.226 0.022 254)`) instead of flipping to white. `card` and `sidebar` both sit one step lighter than `background` (`oklch(0.24 0.018 252)` / `oklch(0.186 0.016 252)`), preserving the same "sidebar is cooler and one layer removed" relationship as light mode. The Status traffic-light colors (`#16a34a` / `#eab308` / `#dc2626`) do not change between themes — they're the one vocabulary that must read identically regardless of mode.

### Named Rules
**The One Voice Rule.** Deep Chapel Blue is the only saturated brand color and it never exceeds roughly 10% of a screen's surface. Reach for a neutral tint (`/8`–`/15` opacity) before reaching for a stronger blue.

**The Traffic-Light Exception.** Status Green/Amber/Red are the one place the system intentionally steps outside the OKLCH brand ramp and uses literal, universally-understood colors. This is deliberate: staffing and confirmation states must read instantly and unambiguously to an anxious admin or an older volunteer, and a brand-tinted "success" color would blunt that. Never use these three colors for anything except staffing meters and assignment confirmation state.

## 3. Typography

**Body/UI Font:** Atkinson Hyperlegible (with sans-serif fallback)
**Mono Font:** JetBrains Mono (with monospace fallback), used for timestamps and audit-log/technical detail only.

**Character:** One accessibility-first sans carries the whole interface — headings, labels, buttons, body, data — at a tight scale ratio. Atkinson Hyperlegible was designed by the Braille Institute specifically to keep letterforms distinguishable at small sizes for low-vision readers, which is exactly the population this app can't afford to lose.

### Hierarchy
- **Headline** (600, 1rem/16px, 1.25 line-height): drawer/dialog section headers like "Navigation."
- **Title** (500, 0.875rem/14px, 1.3 line-height): card titles, dialog titles, the "Church CRM" wordmark.
- **Body** (400, 0.75rem/12px, 1.625 line-height): default UI copy, descriptions, table content. Prose blocks cap at ~72ch (see `.workspace-section-description`).
- **Label** (500, 0.75rem/12px, 1 line-height): nav links, badges, tabs, buttons.
- **Mono** (400, 0.75rem/12px): audit log entries, timestamps, anything technical/exact.

### Named Rules
**The One-Family Rule.** Product UI does not get a display/body pairing. Atkinson Hyperlegible carries every weight of the hierarchy; introducing a second family for "impact" would undercut the legibility mandate that is the whole point of the system.

## 4. Elevation

Flat by default, ring-bordered instead of shadowed at rest. Cards, panels, and inputs use a 1px `ring-foreground/10` or `border` to separate from the background — never a resting shadow. Shadow is reserved entirely for layers that detach from the page flow, and its strength scales with how far that layer floats: a small `shadow-sm` for icon badges and the active sidebar item, `shadow-md` for popovers/dropdowns/selects, `shadow-lg` for the mobile drawer sheet and dragged volunteer cards, up to `shadow-xl` for the command palette (the furthest, most modal-like layer in the app).

### Shadow Vocabulary
- **Ambient badge** (`shadow-sm`): icon badges in the sidebar/header, the active sidebar nav row.
- **Floating panel** (`shadow-md`, paired with `ring-1 ring-foreground/10`): popovers, dropdown menus, select menus.
- **Floating panel, elevated** (`shadow-lg`): the deepest dropdown-menu submenu tier, a volunteer card while being dragged.
- **Modal peak** (`shadow-xl`): the command palette — the single highest layer in the z-index scale.

### Named Rules
**The Grounded-Until-Floating Rule.** A surface earns a shadow only when it has left the document flow (popover, dropdown, dialog, drawer, command palette). Anything still sitting in-line with the page — cards, panels, list rows — stays flat and uses a ring or border instead. Depth communicates "this is temporary and overlaid," not "this is important."

## 5. Components

Built on base-ui/react primitives (not Radix) with `class-variance-authority` for variants, styled through Tailwind v4's CSS-first `@theme`. Every interactive primitive is shared from `@church/ui` and consumed identically across the volunteer and admin surfaces — the same button is the same button everywhere.

### Buttons
- **Shape:** `radius-control` (8px, `rounded.md`).
- **Sizes:** `xs` (24px) / `sm` (28px) / `default` (32px) / `lg` (36px) / icon variants matching each height. Desktop-dense by default.
- **Primary:** solid Deep Chapel Blue, white text, `hover:bg-primary/80`.
- **Outline / Secondary / Ghost / Destructive / Link:** all share the same shape and sizing scale; only fill and text color change. Destructive uses a soft `destructive/10` tint at rest, not a solid red fill, so it doesn't read as an alarm until interacted with.
- **Focus:** 1px ring in `ring/50`, border shifts to `ring` color — consistent across every variant.

### Badges
- **Style:** 20px tall, `radius-control`, used for counts (unread tabs), staffing percentages, and conflict labels.
- **State:** default (primary fill), secondary, destructive, outline, ghost — same variant vocabulary as buttons for consistency.

### Avatars
- **Shape:** square, not circular — overridden to `radius-control` (e.g. the user-menu trigger), a deliberate break from the base-ui default circle to match the rest of the system's control shape vocabulary.
- **Style:** initials-only `AvatarFallback` on a `primary/12` tint with `primary` text; no photo avatars in the current build.
- **Sizes:** `sm` / `default` / `lg` via `data-size`, each with a matching `AvatarFallback` type scale step.

### Cards / Containers
- **Corner style:** `radius-surface` (10px, `rounded.lg`).
- **Background:** `card`, lifted from `background` by a subtle top-to-bottom gradient (`card` mixed 86%→100% with white) rather than a shadow.
- **Border:** `ring-1 ring-foreground/10`, not a hard border — softer separation than a stroke.
- **Internal padding:** 1rem (`0.75rem` in the compact `size="sm"` variant).
- Two purpose-built surface utilities extend the base card: `.surface-panel` (the gradient-lifted default) and `.surface-subtle` (a flatter, more recessed variant for nested/secondary content — used instead of nesting a second Card).

### Inputs / Fields
- **Style:** `radius-control`, 32px tall, 1px `input`-color border, `text-xs`.
- **Focus:** border shifts to `ring`, plus a 1px ring glow — no color-only focus indicator.
- **Placeholder:** deliberately darker than the muted default to hit body-text contrast, not the washed-out gray that's the common accessibility failure.
- **Error:** `destructive` border + ring, in both light and dark mode.

### Navigation
- **Desktop sidebar:** collapsible (240px ↔ 64px) via a spring transition, active item gets a `primary/11` tinted background with a solid `primary` icon chip; inactive items are `sidebar-foreground/78`.
- **Nested nav (e.g. Scheduling's Planning / Tailoring / Builder events):** expanded state draws a thin `sidebar-foreground/25` tree stem down the left edge with a stub connecting to each child row — a literal parent/child hierarchy, not a second-level tab bar. Collapsed state drops the tree entirely and shows child icons as a stacked icon rail with tooltips.
- **Mobile:** a sticky top header (search + notifications + hamburger) plus a fixed bottom tab bar — both live in the cooler `sidebar` surface tone, both use 44px+ touch targets even though desktop controls are 32px, honoring the older-adult/mobile-volunteer accessibility mandate.
- **Sub-navigation (e.g. Scheduling tabs):** underline-indicator pattern — a `scale-x-0 → scale-x-100` bar beneath the active label, not a filled pill.
- **Breadcrumbs:** desktop-only, derived from the route path. Opaque IDs (UUIDs) are dropped from the trail automatically, unless the segment resolves to a real name via live data (e.g. a planning-cycle ID renders as the cycle's name once fetched) — the crumb favors a human label over hiding the segment.

### Staffing Meter (signature component)
A dedicated component with two renderings: a compact percentage `Badge` (per time-slot) and a full `Progress` bar (per event), both colored by the Status vocabulary — red under 50%, amber 50–99%, green at 100%. This is the one place in the system where the Traffic-Light Exception applies.

## 6. Do's and Don'ts

### Do:
- **Do** carry every UI surface in Atkinson Hyperlegible — it's the accessibility commitment the whole system is built on.
- **Do** keep the primary blue-violet (`primary`) to ≤10% of any screen; reach for opacity tints (`/8`–`/15`) before a solid fill.
- **Do** keep cards, panels, and list rows flat with a `ring-1 ring-foreground/10` or `border`; reserve shadow for popovers, dropdowns, dialogs, the drawer, and the command palette.
- **Do** use the green/amber/red status vocabulary only for staffing percentage and assignment confirmation state.
- **Do** size touch targets at 44px+ on mobile/volunteer-facing controls even when the equivalent desktop control is 32px.
- **Do** reuse `@church/ui` primitives (Button, Card, Badge, Input, Dialog, Tabs) rather than building one-off styled elements — the same control must look and behave identically on the volunteer dashboard and the admin planning screens.
- **Do** re-tune colors for dark mode rather than inverting them — `primary` lightens/desaturates instead of staying the same hex-equivalent value, so it keeps AA contrast against the dark `background`.

### Don't:
- **Don't** introduce a cream/sand/tinted-warm body background — the app background is a cool near-white (`oklch(0.978 0.004 236)`), not a warm neutral.
- **Don't** use gradient text, hero-metric tiles, side-stripe colored borders, or tiny uppercase eyebrow labels — none of these appear anywhere in the current system and they don't fit a task-focused product register.
- **Don't** add a second display typeface "for hierarchy." One family, weight and size do the work.
- **Don't** apply a resting shadow to an in-flow surface (card, panel, table row) — that's reserved for layers that have left the document flow.
- **Don't** use the status green/amber/red colors for anything decorative, branding, or unrelated to staffing/confirmation state.
- **Don't** ship a component with only a default state — every interactive control needs hover, focus-visible, disabled, and (where relevant) loading/error states, matching what's already built for Button/Input.
- **Don't** design admin-only density (32px controls, `text-xs` everywhere) into volunteer-facing mobile flows without deliberately upsizing touch targets first.
