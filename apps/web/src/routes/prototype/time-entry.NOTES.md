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

**Retained as an implementation reference. Do not delete it merely because a
direction has been selected.** This started as a throwaway and stopped being
one: nine commits in, it carries a working component and four solved bugs that
would otherwise be rediscovered from scratch.

### What is reusable, and what is not

| Path | Status |
| --- | --- |
| `components/ui/time-field.tsx` | **Production code.** Copy it as-is. |
| `routes/prototype/time-entry.tsx` | **Reference only.** Read the `B` control and the helpers; the scenarios and variant switching are scaffolding. |
| `time-entry.NOTES.md` | Reference. |

`components/ui/time-field.tsx` is the `@intentui/time-field` registry component
**retokened** to this project's DESIGN.md vocabulary, plus the half-typed `1-`
rendering. Rebuilding it means running `shadcn add @intentui/time-field` again,
getting intentui's absent tokens, and rediscovering why the field renders
unstyled. Three commits shaped it, so it is easier to copy the file than to
cherry-pick: `b75cd5b` (install and retoken), `bb7b7ab` (the `1-` rendering),
`0ec1385` (restarting a full segment).

From `routes/prototype/time-entry.tsx`, the parts worth lifting into the real
components are `SegmentedWithListControl`, `readSegments`, `optionsFor` and
`describeSpan`. Everything else — the four scenarios, the variant switcher, the
state panel — exists to make the decision drivable and should not ship.

**The decision itself does not depend on this branch.** It lives in
[#133](https://github.com/tiagoluizpoli/church/issues/133) and on the map
[#126](https://github.com/tiagoluizpoli/church/issues/126), both on GitHub. What
lives here is the head start.

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
- the list **narrows to what is still reachable in the segment being typed**.
  The filter reads the segments from the DOM (`data-type`, `aria-valuenow`,
  which one holds the caret) rather than keeping a parallel digit buffer — the
  buffer version had no idea which segment a digit landed in, so typing `11`
  then `04` searched `04` as if it were an *hour*. In the hour, one digit is
  ambiguous the way the segment treats it (`1` may still become `01` or any of
  `10`-`19`, so all stay, chronologically); two digits settle it. In the minute
  the hour is already fixed and the list never leaves it: `10` then `1` gives
  `10:15`, `3` gives `10:30`. This is the type-ahead's best trait without its
  worst one: the hour can only ever be a real hour, because the segment refuses
  anything else.

Verified end to end:

```
type "1"     field 01:00   01:00 01:15 01:30 01:45 10:00 ... 19:45
type "11"    field 11:00   11:00 11:15 11:30 11:45
type "111"   field 11:01   11:15
type "113"   field 11:03   11:30
type "10"    field 10:00   10:00 10:15 10:30 10:45
type "101"   field 10:01   10:15
type "103"   field 10:03   10:30
type "1104"  field 11:04   (none - no quarter falls at :04)
ArrowDown x2               moves the highlight, field value untouched
Enter                      commits the highlighted row
Escape                     closes; ArrowUp then steps the segment again
Tab                        closes
```

Keyboard path through a form, which is the whole point of the segments:

```
field 1 hour -> field 1 minute -> field 2 hour -> field 2 minute
```

The chevron is deliberately **out of the tab order** (`tabIndex={-1}`). It is a
mouse affordance and everything it offers is reachable by typing, so leaving it
tabbable only meant Tab out of the minute landed *inside* the control the
leader had just finished instead of on the next field.

Edge cases checked rather than assumed:

```
hour "9"      09:00 ...       only 09, since no hour starts 9x
hour "2"      02:00 + 20-23   both readings stay live
hour "25"     -> 05:00        the segment rejects 25; 5 restarts the hour
minute "9"    -> 12:09        list empty, correctly - no quarter at :09
10:30 then 1  -> 10:1-        a digit in a full segment restarts it
10:30 then 4  -> 10:4-  10:45
11 then 04    -> 11:04        list closed, correctly
click a row   commits, caret never leaves the field
```

Two bugs worth remembering, because both came from the same buffer:

- **A digit typed into a full segment must restart it**, as React Aria does to
  the value. Appending blindly turned a minute on `30` into the buffer `301`,
  which matches no time — so the list silently emptied *and* the half-typed
  dash stopped rendering. One line, two symptoms.
- **Picking a row must wipe the pending digits.** The value committed to
  `11:15` correctly while the field went on showing `11:1-`, because the digits
  lived inside the field and nothing told it the value had changed underneath.
  Submitted value and visible value disagreeing is worse than a dead key.

**A half-typed segment renders as `1-`, not `01`.** React Aria pads the moment
a digit lands, so typing a single `1` leaves the field reading `01:00` — a
complete, valid and *wrong* time that looks committed. On an empty field the
whole control now reads `1-:––`, which says plainly that nothing is settled yet.

Dropping the leading zero outright is not available — two-digit hours are
intrinsic to `hourCycle={24}` formatting, and removing `shouldForceLeadingZeros`
changes nothing. Overriding what the segment *renders* is available:
`DateSegment` takes a render function with `text` / `isFocused` /
`isPlaceholder`, so the dash is display only and the padded form returns the
moment the segment is settled or the caret leaves.

This lives in `ui/time-field.tsx`, not in the combobox: the field is the thing
the caret is in, so it owns the pending digits and reports them upward for the
list to filter on. One source, two consumers.

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

## Mobile keyboard: already handled, at no cost

Carried in from the survey ([#130](https://github.com/tiagoluizpoli/church/issues/130))
and now closed. React Aria renders segments as focusable `div`s, so the worry
was which keyboard a phone would raise. It puts the answer on the segment
itself:

```
inputmode="numeric"                 number pad, not the full keyboard
contenteditable="true"              what makes a keyboard appear on a div at all
enterkeyhint="next"                 the mobile Enter reads "next", advances to the minute
autocorrect="off" spellcheck="false"
style="caret-color: transparent"
```

Nothing to enforce and nothing to add — it is the library default, and it
survives this project's override of what the segment renders. No OS wheel
picker either, which the survey had already disqualified on WCAG 2.2 target
size.

What remains is a five-minute sanity check on a real handset during
implementation, not a decision: the mechanism is the standard one and the
direction does not depend on the outcome.
