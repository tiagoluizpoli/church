// Schedule export, Cards template (#1250): phone-width cards, one per Event,
// cut into pages of at most 1600 px at 144 ppi (800pt), only between cards.
// Each page is one image; a card taller than a page is a page of its own.
// From prototype variant F (prototype/schedule-export-layouts). Data comes in
// as JSON only (docs/agents/typst.md): `data` is the export tree, `text` the
// fixed text, `days`/`times` the locale's wording of each day and HH:mm time.
// Never markup from user text.
#let d = if "payload" in sys.inputs { json(bytes(sys.inputs.payload)) } else { json(sys.inputs.payload_file) }
#let data = d.data
#let t = d.text

// apps/web/DESIGN.md tokens
#let fg = oklch(28.6%, 0.032, 254deg)
#let mfg = oklch(48%, 0.024, 250deg)
#let bd = oklch(88.5%, 0.012, 242deg)
#let mut = oklch(95.5%, 0.008, 236deg)
#let acc = oklch(94.8%, 0.018, 247deg)
// The Church's accent colour (`#rrggbb`) when it set one, with the text that
// reads on it; otherwise the app's primary.
#let pri = if "accent" in sys.inputs { rgb(sys.inputs.accent) } else { oklch(37.8%, 0.09, 255deg) }
#let on-pri = if "accentText" in sys.inputs { rgb(sys.inputs.accentText) } else { white }
#let on-pri-soft = if "accent" in sys.inputs { on-pri.transparentize(20%) } else { oklch(88%, 0.03, 255deg) }
#let des = oklch(56%, 0.207, 26deg)
#let des-bg = oklch(97%, 0.015, 26deg)
// Sector colours only repeat the written Sector name.
#let palette = (
  oklch(45%, 0.13, 255deg),
  oklch(50%, 0.1, 190deg),
  oklch(50%, 0.12, 145deg),
  oklch(50%, 0.13, 300deg),
)

// 540pt at 144 ppi is 1080 px; 1pt is 2 px.
#let page-width = 540pt
#let margin = (x: 18pt, top: 22pt, bottom: 24pt)
#let content-width = page-width - 2 * margin.x
// 1600 px at 144 ppi, less the margins; 1pt spare against rounding.
#let max-content-height = 800pt - margin.top - margin.bottom - 1pt
#let gap = 8pt

#set document(title: t.kicker + " · " + data.ministry.name + " · " + data.cycle.name)
#set page(width: page-width, height: auto, margin: margin, fill: oklch(99.2%, 0.002, 220deg))
#set text(font: "Atkinson Hyperlegible", size: 14.5pt, fill: fg)
#set par(leading: 0.4em)

#let day(value) = d.days.at(value)
#let time(value) = d.times.at(value)
// A block label adds to the title unless it is empty or repeats it.
#let adds(label, title) = label != none and lower(label) != lower(title)
#let colour(index) = palette.at(calc.rem(index, palette.len()))

// Header: logo, "Escala", Ministry, the part's name and single Sector/Role
// line, draft tag; Cycle and its span.
#let header(pt) = {
  grid(
    columns: (auto, 1fr, auto),
    column-gutter: 14pt,
    align: horizon,
    if "logo" in sys.inputs { box(image(sys.inputs.logo, width: 44pt), radius: 10pt, clip: true) },
    {
      text(size: 11pt, weight: "bold", fill: mfg, t.kicker)
      linebreak()
      text(size: 21pt, weight: "bold", data.ministry.name)
      if pt.name != none {
        linebreak()
        text(size: 15pt, weight: "bold", fill: pri, pt.name)
      }
      if pt.single != none {
        linebreak()
        text(size: 11pt, weight: "bold", fill: pri, pt.single)
      }
      if data.isDraft {
        linebreak()
        box(stroke: 1.5pt + des, inset: (x: 8pt, y: 2pt), radius: 4pt, text(size: 11pt, weight: "bold", fill: des, t.draft))
      }
    },
    align(right, {
      text(size: 15pt, weight: "bold", data.cycle.name)
      linebreak()
      text(size: 13pt, fill: mfg, t.range)
    }),
  )
  v(-4pt)
  line(length: 100%, stroke: 1pt + bd)
}

// A bar over cards: an Event group's name and its Events' title when they
// share one (the cards then leave it out).
#let bar(name, shared) = block(width: 100%, fill: pri, radius: 10pt, inset: (x: 12pt, y: 8pt), {
  text(size: 16pt, weight: "bold", fill: on-pri, name)
  if shared != none {
    h(8pt)
    text(size: 12.5pt, fill: on-pri-soft, shared)
  }
})
#let shared-title(events) = {
  let titles = events.map(ev => ev.title).dedup()
  if titles.len() == 1 { titles.first() } else { none }
}

// The time band left of a row: a plain time reads vertically in a narrow
// band; a label, a day or a span reads horizontally in a wider one.
#let band(lines, vertical) = {
  let label = text(size: 13pt, weight: "bold", fill: on-pri, lines.join(linebreak()))
  if vertical {
    (width: 30pt, body: rotate(-90deg, reflow: true, label))
  } else {
    (width: 62pt, body: align(center, label))
  }
}

// A Sector's name (unless the part has one Sector) and its people, one per line.
#let sector-cell(part, sec) = {
  if part.singleSector == none {
    text(size: 12pt, weight: "bold", fill: colour(sec.paletteIndex), {
      box(width: 7pt, height: 7pt, radius: 2pt, fill: colour(sec.paletteIndex))
      h(6pt)
      sec.name
    })
    linebreak()
  }
  let names = sec.people.map(p => {
    let name = if p.name == none { text(fill: mfg, t.emptySpot) } else { p.name }
    if part.singleRole == none { [#name #text(size: 12pt, fill: mfg, "(" + p.role + ")")] } else { name }
  })
  if names.len() == 0 { text(fill: mfg, "—") } else { names.join(linebreak()) }
}

// One row of a card: its band (if any) beside its cells, Sectors two by two.
// Cells of a line share its height, so the dividers run the full row.
#let row(lines, vertical, cells, cols, fill: none) = {
  let rows = calc.max(1, calc.ceil(cells.len() / cols))
  let quiet = 0.5pt + mut
  let body = cells.enumerate().map(((i, c)) => grid.cell(
    fill: fill,
    stroke: (left: if calc.rem(i, cols) > 0 { quiet }, top: if i >= cols { quiet }),
    c,
  ))
  if lines.len() == 0 {
    return grid(columns: (1fr,) * cols, inset: (x: 10pt, top: 7pt, bottom: 8pt), ..body)
  }
  let b = band(lines, vertical)
  grid(
    columns: (b.width,) + (1fr,) * cols,
    inset: (x: 10pt, top: 7pt, bottom: 8pt),
    grid.cell(rowspan: rows, fill: pri, inset: (x: 2pt, y: 8pt), align: center + horizon, b.body),
    ..body,
  )
}

// The compact header atop every image of a part after its first: "Escala",
// Ministry, Cycle and span on one line, then the part's name and draft tag.
#let compact-header(pt) = {
  text(size: 11pt, fill: mfg, {
    text(weight: "bold", t.kicker)
    " · "
    text(weight: "bold", fill: fg, data.ministry.name)
    " · " + data.cycle.name + " · " + t.range
    if pt.name != none {
      " · "
      text(weight: "bold", fill: pri, pt.name)
    }
  })
  if data.isDraft {
    h(8pt)
    box(stroke: 1pt + des, inset: (x: 5pt, y: 1.5pt), radius: 3pt, text(size: 9.5pt, weight: "bold", fill: des, t.draft))
  }
  v(-6pt)
  line(length: 100%, stroke: 1pt + bd)
}

#let cancelled(label) = align(center, pad(y: 5pt, text(weight: "bold", fill: des, label)))

#let card(part, ev, shared) = {
  let (weekday, ..date) = day(ev.startDay).split(" ")
  let when = if ev.startDay == ev.endDay {
    [#text(size: 11pt, weight: "bold", fill: mfg, upper(weekday)) #h(4pt) #text(size: 17pt, weight: "bold", date.join(" "))]
  } else {
    text(size: 17pt, weight: "bold", day(ev.startDay) + " – " + day(ev.endDay))
  }
  let cols = if part.singleSector == none { 2 } else { 1 }
  let rows = ()
  if ev.cancelled {
    rows.push(row((), false, (cancelled(t.noService),), 1, fill: des-bg))
  }
  for b in if ev.cancelled { () } else { ev.timeBlocks } {
    let block-label = if adds(b.label, ev.title) { (b.label,) } else { () }
    if b.cancelled or b.shifts.len() == 0 {
      let cell = if b.cancelled { cancelled(t.cancelled) } else { text(fill: mfg, "—") }
      rows.push(row(block-label, false, (cell,), 1, fill: if b.cancelled { des-bg }))
      continue
    }
    for s in b.shifts {
      let named = block-label + (s.label, if s.day != none { day(s.day).split(" ").first() }).filter(x => x != none)
      let lines = if named.len() == 0 { (time(s.startTime),) } else { named + (time(s.startTime), "–", time(s.endTime)) }
      rows.push(row(lines, named.len() == 0, s.sectors.map(sec => sector-cell(part, sec)), cols))
    }
  }
  block(width: 100%, breakable: false, stroke: 1pt + bd, radius: 10pt, clip: true, fill: white, stack(
    block(width: 100%, fill: acc, inset: (x: 12pt, y: 7pt), stroke: (bottom: 1pt + bd), grid(
      columns: (auto, 1fr),
      align: (left + horizon, right + horizon),
      when,
      if shared == none { text(size: 12.5pt, fill: mfg, ev.title) },
    )),
    ..rows.enumerate().map(((i, r)) => if i == 0 { (r,) } else { (line(length: 100%, stroke: 2pt + pri), r) }).flatten(),
  ))
}

// Pack whole units into pages no taller than max-content-height. Each part
// starts a page with the header naming it, and its later pages with the
// compact header unless the one card on the page only fits without it; a
// group bar travels with the card below it.
#context {
  let pages = ()
  for (pi, part) in data.parts.enumerate() {
    let units = (header(t.parts.at(pi)),)
    let bars = ()
    for group in part.groups {
      let shared = if group.kind == "list" { none } else { shared-title(group.events) }
      if group.kind != "list" {
        bars.push(bar(if group.name == none { t.catchAll } else { group.name }, shared))
      }
      for ev in group.events {
        units.push(stack(spacing: gap, ..bars, card(part, ev, shared)))
        bars = ()
      }
    }
    let compact = compact-header(t.parts.at(pi))
    let compact-height = measure(block(width: content-width, compact)).height
    let current = ()
    let height = 0pt
    for u in units {
      let h = measure(block(width: content-width, u)).height
      if current.len() > 0 and height + gap + h > max-content-height {
        pages.push(current)
        let fits = compact-height + gap + h <= max-content-height
        current = if fits { (compact,) } else { () }
        height = if fits { compact-height } else { 0pt }
      }
      height += if current.len() > 0 { gap + h } else { h }
      current.push(u)
    }
    pages.push(current)
  }
  for (i, units) in pages.enumerate() {
    if i > 0 { pagebreak() }
    stack(spacing: gap, ..units)
  }
}
