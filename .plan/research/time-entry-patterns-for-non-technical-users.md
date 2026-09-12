# Time entry for non-technical users: product patterns and React component candidates

Research for [#130](https://github.com/tiagoluizpoli/church/issues/130), child of map
[#126](https://github.com/tiagoluizpoli/church/issues/126). **Findings only** — the direction is
picked in [#133](https://github.com/tiagoluizpoli/church/issues/133).

Date: 2026-09-11. Branch: `research/time-entry-patterns`.

## The question

How do real products let non-technical people — explicitly including elderly users and people with
no technical background — enter a time of day, and is there an off-the-shelf React component worth
adopting here?

## Current state

No picker component exists. Time entry is four native `<input type="time">` elements:

- `apps/web/src/features/scheduling/components/planning-admin/template-block-row.tsx:69,86`
- `apps/web/src/features/scheduling/components/tailoring/tailoring-filters.tsx:88,104`

## Constraints taken as given (from #126, not relitigated)

- **24-hour format is locked.** 12h is a future axis; nothing 12h ships now, but the chosen
  component must not preclude it.
- Church timezone is the sole source of truth; config lives in `church.settings`.

---

## Headline finding

**The status quo is not merely ugly — it is incompatible with the locked 24-hour decision.**

Per MDN, for `<input type="time">` the *value* is always 24-hour `HH:mm`, but the *display* is not
author-controllable:

> "While the control's user interface appearance is based on the browser and operating system, the
> features are the same."

There is no attribute to force 24-hour rendering. The format shown to the user is decided by their
browser and OS locale. A Brazilian user on a Portuguese OS will usually see 24h; the same page on a
US-English browser profile renders `10:30 AM`. So today the app already violates "24h format,
locked" for some fraction of users, silently, with no code change able to fix it short of replacing
the element.

This was observed in the field by a GOV.UK service team in 2018, who abandoned `input type="time"`
on desktop for exactly this reason:

> "we found this was too unpredictable on desktop browsers, I think Firefox asked for it in am/pm,
> Chrome asked in 24 hour and Safari wouldn't accept anything with a colon in it and expected the
> user to enter the time as '1330' for 1:30pm."
> — [govuk-design-system-backlog#173](https://github.com/alphagov/govuk-design-system-backlog/issues/173)

That reframes the ticket: this is a correctness issue with a usability issue attached, not a
cosmetic preference.

---

## Part 1 — Product patterns

### Primary evidence: GOV.UK's time-input backlog

[alphagov/govuk-design-system-backlog#173](https://github.com/alphagov/govuk-design-system-backlog/issues/173)
is the single most valuable source found. GOV.UK has no shipped time-input component — the pattern
has sat in the community backlog since November 2018 precisely because teams could not agree. What
the issue *does* contain is first-hand user research from several UK government services, whose
audience is the general public including elderly and low-digital-confidence users. That is a much
closer match to this project's audience than any design-blog roundup.

Findings from the GDS patterns team, testing a two-box (hour / minute) time entry with participants
told to enter "6pm to midnight":

> - "Users were often unclear on 24hr clocks or 12hr clocks."
> - "Some users tried to enter the range in both boxes. eg 6pm or 18:00 in one box, and 12pm in the next box."
> - "Lots of confusion around what midnight is - some users entering 12:00, some 00, some 24."
> - "**Our screen reader users were excellent at entering it. They paid much more attention to the example time format.**"

Their own takeaways: make am/pm explicit; consider a single box; provide clear format examples;
"possibly explore a dropdown / ui element to limit the input to range."

The screen-reader finding is worth dwelling on, because it inverts the usual assumption: the failure
mode here is **not** an assistive-technology failure, it is a *sighted-user-ignores-the-hint*
failure. Sighted users skipped the format hint; screen reader users had it read to them and got it
right. Any design that hides the expected format behind visual-only styling will reproduce this.

Other services reporting in the same thread:

| Service | Approach | Reported outcome |
|---|---|---|
| Get a fishing licence | Enumerated the available times as a list | Chosen specifically "to help users who were confused by midnight, 12:00, 00, 24 etc." |
| GOV.UK Pay | Dedicated time picker widget, 6 users | "tested pretty well"; minor range confusion |
| GOV.UK Content Publisher | Dropdown of discrete times you can also type into | "users were super positive"; dropdown starts at 00:01 to kill the midnight ambiguity; accepts 24h input but plays back 12h |
| HMRC (customs) | 24-hour, two text boxes | 1 user error across research; users are frequent/domain users of 24h |
| Manage teacher training | Single free-text field with parsing | Hint text required; needed "use 12pm for midday" because midday is ambiguous |

Two things generalise out of this:

1. **Midnight and midday are the reliable failure points**, in both clock systems. 24h removes the
   midday ambiguity entirely (12:00 is unambiguous) but keeps the midnight one (00:00 vs 24:00 — and
   "which day?"). Enumerating times sidesteps both.
2. **Constraining input beats parsing input.** Every team that narrowed the input space (dropdown,
   enumerated list, segmented fields) reported better results than the teams parsing free text.

HMRC's 2021 update is directly relevant to the locked 24h decision:

> "We have now changed the time display on our service to the 24 hour clock to match our 24 hour
> time input. Our research showed that this is what the users are used to, and want... We are always
> playing back 4 digits, with a colon (e.g. 23:59, 02:01)."

Note the honest counterweight in the same thread, from Content Publisher: "AM/PM tested really well
and users commented on how much they preferred it to 24hr clock. (We didn't test a 24hour version
explicitly)." Their audience was UK general public, where 12h is the cultural default. The lesson is
that the *right* format is the one the audience already uses — which is a point in favour of
choosing a component where the format is a cheap, flippable prop rather than a rewrite.

### The interaction models, and what's known about each

**1. Native `<input type="time">`.** Zero cost, real OS pickers on mobile, and the browser's own
accessibility. But format is not author-controllable (above), desktop implementations diverge
wildly, and screen-reader support is inconsistent — reports of the role announced variously as "text
input", "edit", or "edit time", with browsers differing on whether segments are separate tab stops.
Degrades acceptably (it is a text-ish field), but you cannot guarantee what the user sees.

**2. Segmented fields (HH `:` MM as separate controls).** The GDS/HMRC approach and the model behind
every modern date/time *field* library. Each segment is a
[`role="spinbutton"`](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/): arrow keys
increment/decrement, Home/End jump to min/max, typing digits sets the value directly. The APG has a
[date picker spinbuttons example](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/)
built exactly this way, and notes the key trick — `aria-valuetext` lets the control announce
something friendlier than the raw number, and grouping the segments lets a screen reader read the
whole value at once "without having to navigate to all three buttons."

This is the best-understood pattern from an accessibility standpoint and it is 24h-native (an hour
segment with min 0 / max 23 needs no am/pm segment at all). Its weakness is discoverability: a user
who does not realise the segments are separately editable may try to type "1830" straight through
and, depending on implementation, get surprising results. It also cannot express "I don't know the
exact minute."

**3. Dropdown / select of discrete times.** The fishing-licence and Content Publisher approach, and
the dominant pattern in consumer booking (Calendly, Zocdoc, OpenTable all render enumerated slots).
It has the strongest single property for this audience: **it is impossible to enter an invalid
time**, and it teaches the format by showing it. No parsing, no midnight ambiguity, no am/pm
question.

The cost is option count. Baymard's testing is blunt about this:

> "drop-downs are generally a poor choice for offering fewer than 5 or more than 10 options"

A day at 15-minute granularity is 96 options; at 30 minutes, 48. Both are far past that threshold,
and Baymard specifically documents the scroll failure: when the cursor leaves the open dropdown,
"users will most likely scroll down the page instead of the drop-down... likely leaving users with
erroneous data." They also found "55% of users across our testing were observed to open a drop-down,
just to see what it contained, and then immediately close it again."

So a naive `<select>` of every time is a trap. What makes this pattern work in the products that use
it well is *domain scoping* — Calendly does not list 96 times, it lists the 6 slots that are
actually available. This project has an equivalent lever: a church service almost never starts at
03:47. A list scoped to plausible service hours, or a combobox that filters as you type, brings the
option count back into range.

**4. Combobox / type-or-pick.** The Content Publisher design: a text field that filters an
enumerated list, accepting typed input as a shortcut. Structurally this is the answer to Baymard's
option-count problem, and it is the only pattern that serves both the confident user (types "19",
gets 19:00) and the unsure user (opens it, reads the list). The tradeoff is implementation
complexity and a harder accessibility story than a plain select — it is a composite widget, and
getting the ARIA combobox pattern right is non-trivial (though the repo already has a primitive for
it, see Part 2).

**5. Wheel / drum pickers.** The iOS-style scrolling drum. Native on mobile and familiar there, but
poor on desktop, and the accessibility literature is consistently unenthusiastic: they are
small-target, momentum-scrolled controls, which is the exact profile WCAG 2.2's
[Target Size (Minimum), 2.5.8 Level AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
(24×24 CSS px) exists to protect against, for users with "hand tremors, spasticity, and
quadriplegia." Momentum scroll plus small targets plus elderly users with reduced fine motor control
is a bad combination. Not recommended for a desktop-and-mobile admin surface.

**6. Clock face / dial.** Material's dial variant, and the analog clock in some libraries. Visually
appealing, demonstrably worse for precision and for keyboard/screen-reader users, and it maps poorly
to 24h (a 12-position dial needs an am/pm toggle or an inner 13–24 ring, which is the fiddliest part
of Material's own implementation). Android's own docs defer the choice of dial-vs-input entirely to
Material's guidance rather than recommending the dial.

**7. Free text with parsing.** The Manage teacher training approach. Maximum flexibility, maximum
error surface. The thread contains a good demonstration of why it is hard — asked whether a leading
zero and a separator could both be optional, Edward Horsford's objection stands:

> "`112` - is this `1:12` or `11:02` or `11:20`? ... `12` - is this `12:00` or `1:20` or `1:02`"

Not recommended as the primary input for this audience, though it is a reasonable *tolerance* layer
behind another pattern.

### Synthesis of Part 1

For a general-public audience the evidence favours **constraining rather than parsing**, and favours
**showing the expected format rather than hinting at it**. The two patterns with the best evidence
are segmented spinbutton fields (best-understood accessibility, 24h-native, keyboard-excellent) and
enumerated/filterable time lists (lowest error rate, self-teaching, but needs the option count
scoped). These are not mutually exclusive — several shipped products compose them.

---

## Part 2 — Library candidates

### Verified ecosystem facts

From `apps/web/package.json` and `apps/web/components.json` (checked, not assumed):

- `@base-ui/react` ^1.0.0
- **`react-aria-components` ^1.19.0 — already a direct dependency**
- `@internationalized/date` 3.12.2 — already present transitively via `react-aria-components` (`bun.lock:702`)
- `react-day-picker` ^10.0.1, `date-fns` ^4.1.0, `date-fns-tz` ^3.2.0
- `vaul` ^1.1.2 (drawer), `framer-motion`, Tailwind v4
- `components.json` declares a registry: **`"@intentui": "https://intentui.com/r/{name}"`**, style `base-lyra`

Two of these change the shape of the answer and appear not to have been factored into #126's framing:

1. **`react-aria-components` is already installed** and already used in `components/ui/field.tsx`,
   `components/ui/table.tsx`, `lib/primitive.ts`, and two scheduling feature components. React Aria's
   `TimeField` is therefore not a new dependency — it is an unused part of a dependency already
   carried.
2. **The repo is already wired to the IntentUI registry**, which is a react-aria-components-based
   shadcn-style registry, and it ships a `time-field` item.

### Candidate A — Native `<input type="time">` (status quo)

| | |
|---|---|
| Keyboard | Browser-provided; segment tab stops vary by browser |
| Screen reader | Inconsistent; role announced as "text input" / "edit" / "edit time" depending on AT+browser |
| Touch | Best-in-class — real OS picker, correct virtual keyboard |
| Degrades | Yes, it's a native control |
| 24h-first | **No. Cannot be forced.** Display follows browser/OS locale |
| Cost to adopt | Zero (already there) |

**Disqualifying issue: cannot honour the locked 24h decision.** Everything else about it is fine or
good. Worth keeping in mind as a *mobile fallback* inside another design.

### Candidate B — React Aria `TimeField`, via the `@intentui` registry — lowest-cost serious option

Already-configured registry, already-installed runtime. The registry item is a thin wrapper:

```
curl https://intentui.com/r/time-field
  dependencies:         ["react-aria-components"]        # already installed
  registryDependencies: [date-field, primitive, field]   # primitive + field already exist in repo
```

The whole `src/components/ui/time-field.tsx` is ~20 lines wrapping
`TimeField`/`DateInput`/`DateSegment`. Adoption is `shadcn add @intentui/time-field` plus promoting
`@internationalized/date` from transitive to direct.

| | |
|---|---|
| Keyboard | Segments are `role="spinbutton"`: arrows increment, Home/End min/max, type digits directly, auto-advance between segments. Matches the [APG spinbutton pattern](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/) |
| Screen reader | Each segment carries `aria-valuenow` / `aria-valuetext` / `aria-valuemin` / `aria-valuemax`; the group announces the whole value. Adobe tests against desktop and touch screen readers explicitly |
| Touch | **Needs hands-on verification.** React Aria renders focusable `div`s, not a native `<input type=time>`, so the OS wheel picker does *not* appear; it summons a numeric keyboard instead. Whether that reads as better or worse than the native mobile picker for this audience is an open question — see below |
| Degrades | Partially. A user who doesn't realise segments are individually editable can still type digits straight through and it advances correctly, which is the main saving grace. But it is a custom widget, and it is not a text field |
| 24h-first | **Yes, first-class.** `hourCycle={24}` forces 24h regardless of locale. IntentUI even ships a `time-field-hc-example` demonstrating a live 12↔24 toggle |

Adobe's rationale for segments over free text, from their
[official post](https://react-aria.adobe.com/blog/date-and-time-pickers-for-all):

> "Rather than a free-form text field, we render individually focusable segments for each date and
> time unit."

...because "it is nearly impossible to reliably parse free form text" across locales. That is the
same conclusion the GOV.UK teams reached empirically.

**12h-variant cost: essentially zero.** It is one prop. This is the strongest argument for this
candidate given #126's stated reason for choosing 24h.

### Candidate C — Base UI primitives — *nothing to adopt*

Base UI's component list (Accordion, Autocomplete, Checkbox, Combobox, Field, Input, Menu,
**Number Field**, Popover, Select, Slider, ...) contains **no date field, time field, date picker,
time picker, or calendar**. Confirmed against their quick-start docs. Since `components.json` uses
the `base-lyra` style, this is worth stating plainly: the repo's primary primitive library will not
supply a time picker, now or (on current roadmap evidence) soon.

What it *does* supply are the building blocks for candidates E/F/G below — `Select`, `Combobox`,
`Autocomplete`, and `NumberField` are all present and already in the repo's idiom.

### Candidate D — shadcn/ui's official date+time block — *is Candidate A in a trenchcoat*

shadcn/ui ships no time picker. Its `calendar-24` block ("Date and Time Picker") composes a
`Popover` + `Calendar` for the date and, for the time:

```tsx
<Input
  type="time"
  id="time"
  step="1"
  defaultValue="10:30:00"
  className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden ..."
/>
```

(fetched from `apps/v4/public/r/styles/new-york/calendar-24.json` in `shadcn-ui/ui`)

So "just use shadcn's" resolves to the native input the user already dislikes, plus CSS to hide the
picker indicator. Inherits every flaw of Candidate A including the 24h one. Ruled out.

### Candidate E — Enumerated times in a Base UI `Select`

Compose from a primitive already in the repo (`components/ui/select.tsx`).

| | |
|---|---|
| Keyboard | Native-grade: type-ahead, arrows, Home/End, Escape |
| Screen reader | Listbox pattern, very well supported |
| Touch | On mobile a `<select>` gets the OS wheel; Base UI's custom select gets a normal popup list — fine, but large lists are a scroll burden |
| Degrades | **Best of all candidates.** There is nothing to understand; you read a list and pick |
| 24h-first | Trivially — you generate the labels |
| Cost | Low code, but a real design decision about granularity and range |

The pattern with the lowest observed error rate for this audience, and the one the fishing-licence
team reached for *specifically* to fix midnight confusion. The catch is Baymard's ">10 options" rule
— unusable as a full-day list, workable if scoped (e.g. plausible service hours at 15-min steps), and
lossy if the domain genuinely needs arbitrary minutes. **Whether scheduling needs arbitrary minutes
is the load-bearing unknown here and #133 must answer it.**

### Candidate F — Base UI `Combobox` / `Autocomplete` of enumerated times

The Content Publisher design. Filters the list as you type, so "19" narrows to 19:00/19:15/19:30/…
Solves E's option-count problem and serves confident and unsure users with one control.

| | |
|---|---|
| Keyboard | Strong, but composite — more to get right |
| Screen reader | ARIA combobox pattern; well-trodden but the most error-prone of these to implement correctly |
| Touch | Text field + filtered list; acceptable, not delightful |
| Degrades | Good — it looks like a text box and behaves like one if you ignore the list |
| 24h-first | Trivially (you generate labels), plus you can accept typed 24h input |
| Cost | Moderate; the primitive exists, the behaviour design does not |

### Candidate G — Two Base UI `NumberField` spinbuttons (HH : MM)

The HMRC pattern, built from an existing primitive. Genuinely 24h-native (hour 0–23, no am/pm
concept exists). HMRC reported only one user error in research — but their users were 24h-fluent
customs professionals, which is *not* this project's audience. The GDS patterns team tested the same
shape with a general-public audience and it "did not test well," with users putting a range across
the two boxes. Cheap and honest, but the one piece of direct evidence with a matching audience is
negative.

### Candidate H — Mantine `TimePicker`

Feature-wise the best match to the research: segmented hour/minute inputs, `format="24h"` as the
**default**, arrow/Home/End/Backspace keyboard support, per-segment aria-label props, and a
`withDropdown` mode with `presets` + `getTimeRange()` — i.e. it composes the segmented field *and*
the enumerated list, which is exactly the hybrid the GOV.UK evidence points at.

**But** it depends on Mantine's core styling system (Input wrapper, sizes, variants, CSS layers).
Adopting it means carrying a second design system alongside Tailwind v4 + base-ui, with two theming
stories and two dark-mode implementations. That is a large, permanent architectural cost for one
control. Worth studying as a *design reference* even if not adopted.

### Candidate I — MUI X `TimePicker`

Offers `TimeClock` (dial), `DigitalClock` (single list), `MultiSectionDigitalClock` (parallel
hour/minute columns), and auto-switches desktop popover vs mobile modal via `@media (pointer: fine)`.
`MultiSectionDigitalClock` is a strong pattern — it is Candidate E's enumerated list, split into two
short columns, which dodges Baymard's option-count problem neatly.

Adoption cost is the highest of any candidate: Emotion-based styling, MUI theming, substantial bundle,
and an MIT/Pro licensing split to check. Recommend treating as a **pattern reference, not a
dependency**.

### Candidate J — `wojtekmaj/react-time-picker`

Self-disqualifying. Its own README opens with:

> "If you don't need to support legacy browsers and don't need the advanced features this package
> provides, consider using native time input instead. It's more accessible, adds no extra weight to
> your bundle, and works better on mobile devices."

The author is right, and that advice routes straight back to Candidate A's 24h problem. Ruled out.

### Candidate K — `react-day-picker` + community date-time wrappers

`react-day-picker` (already a dependency) **does not do time**. Its
[own guide](https://daypicker.dev/guides/timepicker) tells you to pair it with a separate time input
and suggests `<input type="time">`. Community wrappers built on it (e.g. `shadcn-datetime-picker`)
add a segmented time input, but they are unaffiliated, single-maintainer, and would be a new
dependency with an unverified accessibility story. No advantage over Candidate B, which is already
installed and Adobe-maintained.

---

## Summary table

| Candidate | New deps | Keyboard | Screen reader | Touch | Degrades | 24h-first | 12h later |
|---|---|---|---|---|---|---|---|
| A. Native `input[type=time]` | none | browser | inconsistent | **best** | yes | **no — impossible** | n/a (uncontrollable either way) |
| B. React Aria `TimeField` (@intentui) | **none** | **excellent** (spinbutton) | **excellent** | needs verification | partial | **yes** (`hourCycle`) | **free — one prop** |
| C. Base UI | — | — | — | — | — | — | *no such component* |
| D. shadcn `calendar-24` | none | = A | = A | = A | = A | **no** | = A |
| E. Select of times | none | excellent | excellent | good | **best** | yes | regenerate labels |
| F. Combobox of times | none | good | good (composite) | good | good | yes | regenerate labels |
| G. Two NumberFields | none | good | good | ok | ok | **yes, natively** | **painful — must add an am/pm control and rework layout** |
| H. Mantine TimePicker | **Mantine core** | excellent | good | good | ok | **yes (default)** | `format="12h"` |
| I. MUI X TimePicker | **MUI + Emotion** | good | good | good (mobile modal) | ok | yes | `ampm` prop |
| J. react-time-picker | yes | ok | ok | author says worse | ok | via `format` | via `format` |
| K. rdp + wrapper | yes | varies | unverified | varies | ok | varies | varies |

### On the 12-hour-variant tradeoff specifically

#126 chose 24h partly because the component must not preclude 12h. Ranking candidates on that axis:

- **Free:** B (one prop), H, I — format is a first-class prop.
- **Cheap:** E, F — you generate the option labels; changing format is a formatting function.
- **Expensive:** G — a 12h variant needs a *third* control (am/pm) that does not exist in the 24h
  version, changing the component's structure and layout, not just its rendering.
- **Moot:** A, D — you cannot control the format in either direction, which is the actual problem.

---

## Open questions for #133

These are deliberately not answered here.

1. **Does scheduling need arbitrary minutes, or would 5/10/15-minute steps cover every real church
   service and shift?** This single answer decides whether the enumerated-list family (E/F/I) is
   viable, and it is a domain question, not a UI one.
2. **What does React Aria's `TimeField` actually feel like on a phone?** It is the one candidate
   whose touch story could not be established from documentation. It does not summon the OS wheel.
   Given the stated audience, this needs hands-on testing on a real device before Candidate B is
   chosen — it is the only material unknown standing between B and a recommendation.
3. **Is a hybrid warranted** — segmented field on desktop, native `input type=time` on mobile (the
   approach a GOV.UK team floated in the thread)? It buys the best mobile experience at the cost of
   two code paths and, critically, reintroduces the uncontrollable-format problem on mobile only.
4. **Where does the format hint live?** The strongest single finding in the GDS research is that
   sighted users skipped the format example while screen-reader users read it. Whatever is chosen,
   the expected format should be *shown*, not hinted — visible placeholder segments (`--:--`) or a
   visible list, not grey helper text.

## Sources

Primary sources, in rough order of value to this question:

- [alphagov/govuk-design-system-backlog#173 — Time input](https://github.com/alphagov/govuk-design-system-backlog/issues/173) — first-hand user research from multiple UK government services with general-public audiences
- [MDN — `<input type="time">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/time) — format controllability, value semantics
- [WAI-ARIA APG — Spinbutton pattern](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/) and [Date Picker Spin Buttons example](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton/examples/datepicker-spinbuttons/)
- [WCAG 2.2 — Understanding Target Size (Minimum) 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Adobe — Date and Time Pickers for All](https://react-aria.adobe.com/blog/date-and-time-pickers-for-all) — design rationale for segmented fields
- [React Aria — TimeField](https://react-aria.adobe.com/TimeField) and [DateField](https://react-aria.adobe.com/DateField) — `hourCycle`, `granularity`, `shouldForceLeadingZeros`
- [Baymard Institute — Drop-Down Usability](https://baymard.com/blog/drop-down-usability) — option-count thresholds, scroll failures
- [GOV.UK Design System — Dates pattern](https://design-system.service.gov.uk/patterns/dates/) — "Never make a calendar control that depends on JavaScript as the only input option"
- [NHS digital service manual — Date input](https://service-manual.nhs.uk/design-system/components/date-input) — separate-fields convention, `inputmode="numeric"`
- [Base UI — Quick start / component list](https://base-ui.com/react/overview/quick-start) — confirms no date/time components
- [Mantine — TimePicker](https://mantine.dev/dates/time-picker/) — `format`, `withDropdown`, `presets`, `getTimeRange()`
- [MUI X — TimePicker](https://mui.com/x/react-date-pickers/time-picker/) — dial / digital / multi-section variants
- [React DayPicker — Date and Time Picker guide](https://daypicker.dev/guides/timepicker) — confirms no built-in time support
- [wojtekmaj/react-time-picker README](https://github.com/wojtekmaj/react-time-picker) — author's own recommendation against it
- IntentUI registry, fetched directly: `https://intentui.com/r/time-field`, `https://intentui.com/r/date-field`, `https://intentui.com/r/time-field-hc-example`
- `shadcn-ui/ui` repo: `apps/v4/public/r/styles/new-york/calendar-24.json`
- This repo: `apps/web/package.json`, `apps/web/components.json`, `bun.lock`
