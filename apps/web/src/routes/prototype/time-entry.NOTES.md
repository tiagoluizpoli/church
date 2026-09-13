# Time-entry direction prototype

Answers [#133](https://github.com/tiagoluizpoli/church/issues/133), a ticket on
the date & time map [#126](https://github.com/tiagoluizpoli/church/issues/126).

- route: `/prototype/time-entry`
- source: `time-entry.tsx`
- run from the repository root: `bun run dev:web`
- variants: `?variant=A|B|C|D`, or the ← → arrow keys
- scenarios and a desktop/touch sizing toggle sit in the header

## Status

**Direction chosen: B — segmented field plus quick list.**

**Throwaway.** Unlike the active-church prototype, nothing here is retained as
an implementation reference. It exists to pick a direction; #133 records the
answer, and this branch is the only copy that needs to survive.

**The control is the shadcn registry component, not a hand-roll.** `shadcn add
@intentui/time-field` — shadcn's own registry has no time component at all, and
`@intentui` is the registry `components.json` already declares. See "shadcn
reality check" below for what the install actually does.

B was refined during the session in response to driving it:

- the chevron moved **inside** the field, into the dead space after the
  segments, rather than sitting beside it as a second box;
- the list became a real **listbox**: Up/Down move the selection, PageUp/Down
  move an hour, Home/End jump to either end of the day, Enter commits, Escape
  closes. Mouse-only scrolling was the gap that made C feel better than it is;
- the list is **exactly as wide as the field** and left-aligned with it. It
  anchors on the chevron (the trigger), so `align="end"` with a −4 offset is
  what puts it over the control rather than hanging off one edge;
- the list became a **combobox rather than a popup**. It opens by itself when
  the field is empty or the moment a digit is typed; Up/Down walk the list
  *without moving the caret*, so focus never leaves the segments; Enter commits
  the highlighted row; Escape closes and hands the arrow keys straight back to
  the segments, where they step the number as before. Rendered inline, not in a
  Popover, because base-ui moves focus into a popup on open — which is exactly
  what must not happen while the field is still being typed into;
- the list **narrows to what is still reachable as you type**. One digit is
  ambiguous the way the segment itself treats it — `1` could still become `01`
  or any of `10`-`19`, so all of those stay, chronologically. Two digits fix the
  hour: `18` leaves only `18:00/18:15/18:30/18:45`. This is the type-ahead's
  best trait without its worst one: the hour can only ever be a real hour,
  because the segment refuses anything else.

Verified end to end:

```
type "1"          list opens by itself
                  01:00 01:15 01:30 01:45 10:00 ... 19:45
ArrowDown x2      highlights 01:30, field value untouched
Enter             commits 01:30, list closes
type "18"         18:00 18:15 18:30 18:45
Escape            list closes
ArrowUp           steps the segment again
```

## shadcn reality check

"Use shadcn" resolves to this direction, but not as a drop-in:

- **shadcn's own registry has no time component.** Searching it for a time
  picker returns nothing. Its "Date and Time Picker" block is the native input
  plus CSS — so "use shadcn's" *is* the broken status quo.
- **`@intentui/time-field` is a shadcn-CLI registry item** (`registry-item.json`
  schema, `type: registry:ui`, installs to `components/ui/`) and is a thin
  wrapper over `react-aria-components/TimeField` — the same primitive this
  prototype chose independently.
- **Its tokens do not exist in this project.** The installed files use
  intentui's palette (`text-fg`, `muted-fg`, `primary-subtle`, `danger-subtle`);
  DESIGN.md uses shadcn's (`foreground`, `muted-foreground`, `primary`,
  `destructive`). Left as installed, the field renders unstyled. It also pulls
  `cn@0.3.0`, redundant beside the existing `clsx` + `tailwind-merge`.
- So the file was **retokened after install**, which is the normal shadcn
  workflow — `components/ui/*` is owned, editable source, not a locked library.
  `date-field.tsx` and the `cn` dependency were dropped; only `TimeInput` is
  needed, and it is defined locally.
- **Pre-existing finding, unrelated to this ticket:**
  `components/ui/field.tsx` is already an intentui component with the same
  absent tokens and has **zero importers** anywhere in the app. Dead code.

C was rejected on evidence from driving it: as a free text box it accepts
`12121:12312`, and its value cannot be stepped with the arrow keys. The
segmented field refuses an impossible value by construction — typing `99` into
the hour yields `09:09`, never anything invalid — and steps every part.

## What the prototype is deciding

Only the **TimeOfDay control**. Four decisions were already locked on the map
before it was built, and every variant obeys all four — so the variants differ
in exactly one dimension, which is what makes them comparable:

- 24h always, never locale-derived ([#132](https://github.com/tiagoluizpoli/church/issues/132))
- arbitrary minutes stay enterable; `00/15/30/45` is a fast path, not a constraint
- no timezone indicator anywhere — church time is implied ([#129](https://github.com/tiagoluizpoli/church/issues/129))
- day + time is two boxes, reusing the audited `DatePickerField` ([#128](https://github.com/tiagoluizpoli/church/issues/128))

## Corrections to the ticket's framing, found while building

The ticket described "four native `<input type="time">` inputs". The real
surface is **nine inputs across five components**, and **five of the nine are
`datetime-local`**:

| File | Inputs | Type |
| --- | --- | --- |
| `planning-admin/template-block-row.tsx` | 2 | `time` (+ a `lang="pt-BR"` attempt at forcing 24h) |
| `tailoring/tailoring-filters.tsx` | 2 | `time` — a filter, not authoring |
| `planning-admin/slot-form-fields.tsx` | 2 | `datetime-local` when multi-day, else `time` |
| `tailoring/manual-split-editor.tsx` | 2 per span, unbounded | `datetime-local` |
| `planning-admin/edit-event-dialog.tsx` | 1 | `datetime-local` |

Two more facts that shaped the scenarios:

- **Every literal time in the repo sits on a `:00` or `:30` boundary** — 13
  distinct values, ~100 occurrences, none at `:15` and none arbitrary. That is
  dev-authored seed and test data, so it is evidence about the common case, not
  proof about the rare one.
- **No Volunteer ever types a time.** All nine inputs are under
  `scheduling/planning-cycles` and `scheduling/tailoring`, which are leader and
  planner surfaces. `tailoring-filters.tsx` does branch to touch sizing, so
  leaders use them on mobile.

## The four variants

- **A — Segmented field.** React Aria `TimeField`: hour and minute are separate
  spinbuttons, typed over or arrowed. `hourCycle={24}` is the entire 24h fix.
  No popup, nothing to scroll.
- **B — Segmented + quick list.** A, plus a chevron opening the 15-minute list,
  scrolled to the value already held. The list is the fast path; the segments
  underneath still accept `18:21`.
- **C — Type-ahead.** One text box. Typing filters the 15-minute list, and the
  parser accepts what a leader in a hurry actually types (`1821`, `6:21pm`,
  `6`, `6.21`), committing on blur or Enter.
- **D — Touch stepper.** No typing at all. Hour and minute as large `+`/`−`
  columns, the minute snapping onto the 15-minute grid until "Fine steps"
  drops it to 1.

## Scenarios

- **Template blocks** — two bare TimeOfDay values, no day.
- **Slot bounds** — one CalendarDay plus two TimeOfDay values, replacing the
  polymorphic `time`/`datetime-local` box.
- **Overnight shift** — the case #128 unlocked by removing `time_block`'s
  `start < end` check. Every variant renders the **computed-span confirmation**
  #128 requires (`Runs 4h · ends next day`) rather than rejecting the input.
- **Tailoring filter** — the one non-authoring surface, checking the control
  still reads right in a cramped filter row.

## Findings worth carrying into the decision

- **`@internationalized/date` must be pinned to the version
  `react-aria-components` resolves** (3.12.2 today). Installing `latest` (3.12.4)
  produces `Type 'Time' is not assignable to type 'TimeValue'` — two copies of
  a nominal type. A real cost of variants A and B, and a cheap one.
- **A satisfies the locked "odd minutes" requirement without any extra
  affordance**: typing `1821` straight over the segments yields `18:21`, and the
  span confirmation updates live.
- **D does not scale to the real forms.** One overnight shift is four stepper
  columns; `manual-split-editor.tsx` renders an unbounded number of spans. On a
  390px viewport a single shift already needs scrolling.
- **A long list must open where you are, not at `00:00`.** Getting that right
  inside a portalled popover took four separate fixes (see `centreNearestRow`);
  base-ui resets `scrollTop` once the open animation settles, so the scroll has
  to be re-applied until it sticks. Real implementation cost for B and C.

## The question the prototype cannot answer

Carried in from the survey ([#130](https://github.com/tiagoluizpoli/church/issues/130))
and still open: **how the segmented field behaves in an older leader's hand on
a phone.** React Aria renders focusable `div`s, so it summons a numeric keyboard
rather than the OS wheel picker. Screenshots cannot settle whether that reads as
better or worse for the audience — it needs the prototype on a real device.
