// Schedule export, Grid template (#1243, Event groups #1247): the A4 landscape PDF.
// From prototype variant E (prototype/schedule-export-layouts) and the
// research branch's throwaway grid. Data comes in as JSON only (docs/agents/typst.md):
// `data` is the export tree, `text` the fixed text, `days`/`times` the
// locale's wording of each day and HH:mm time. Never markup from user text.
#let d = if "payload" in sys.inputs { json(bytes(sys.inputs.payload)) } else { json(sys.inputs.payload_file) }
#let data = d.data
#let t = d.text

// apps/web/DESIGN.md tokens
#let fg = oklch(28.6%, 0.032, 254deg)
#let mfg = oklch(48%, 0.024, 250deg)
#let bd = oklch(88.5%, 0.012, 242deg)
#let mut = oklch(95.5%, 0.008, 236deg)
#let acc = oklch(94.8%, 0.018, 247deg)
#let pri = oklch(37.8%, 0.09, 255deg)
#let des = oklch(56%, 0.207, 26deg)
#let des-bg = oklch(97%, 0.015, 26deg)
// Sector colours only repeat the written Sector name.
#let palette = (
  oklch(45%, 0.13, 255deg),
  oklch(50%, 0.1, 190deg),
  oklch(50%, 0.12, 145deg),
  oklch(50%, 0.13, 300deg),
)

#set document(title: t.kicker + " · " + data.ministry.name + " · " + data.cycle.name)
#set page(paper: "a4", flipped: true, margin: (x: 12mm, top: 11mm, bottom: 10mm), fill: oklch(99.2%, 0.002, 220deg))
#set text(font: "Atkinson Hyperlegible", size: 9pt, fill: fg)
#set par(leading: 0.45em)

#let day(value) = d.days.at(value)
#let span(s) = d.times.at(s.startTime) + "–" + d.times.at(s.endTime)
// A block label adds to the title unless it is empty or repeats it.
#let adds(label, title) = label != none and lower(label) != lower(title)
#let swatch(index) = box(width: 6pt, height: 6pt, radius: 1.5pt, baseline: -0.5pt, fill: palette.at(calc.rem(index, palette.len())))

// Header: logo, "Escala", Ministry, single Sector/Role line, draft tag; Cycle and its span.
#grid(
  columns: (auto, 1fr, auto),
  column-gutter: 10pt,
  align: horizon,
  if "logo" in sys.inputs { box(image(sys.inputs.logo, width: 33pt), radius: 7pt, clip: true) },
  {
    text(size: 8pt, weight: "bold", fill: mfg, t.kicker)
    linebreak()
    text(size: 16.5pt, weight: "bold", data.ministry.name)
    if t.single != none {
      linebreak()
      text(size: 9pt, weight: "bold", fill: pri, t.single)
    }
    if data.isDraft {
      linebreak()
      box(stroke: 1pt + des, inset: (x: 5pt, y: 2pt), radius: 3pt, text(size: 8pt, weight: "bold", fill: des, t.draft))
    }
  },
  align(right, {
    text(size: 11pt, weight: "bold", data.cycle.name)
    linebreak()
    text(size: 9.5pt, fill: mfg, t.range)
  }),
)
#v(-2pt)
#line(length: 100%, stroke: 0.75pt + bd)

// A row never splits across pages; the column header repeats on each page.
#set table.cell(breakable: false)

// Dates as columns of one group table; a wider group continues in a new table.
#let max-date-columns = 6
#let quiet = 0.5pt + mut
#let edge = 1.2pt + pri
#let sector-color(index) = palette.at(calc.rem(index, palette.len()))
#let sector-label(sec) = text(weight: "bold", fill: sector-color(sec.paletteIndex), {
  swatch(sec.paletteIndex)
  h(3pt)
  sec.name
})
#let people(part, sec) = sec.people.map(p => {
  let name = if p.name == none { text(fill: mfg, t.emptySpot) } else { p.name }
  if part.singleRole == none { name + " (" + p.role + ")" } else { name }
}).join(linebreak())
#let shift-when(s) = (
  if s.label != none { s.label },
  if s.day != none { day(s.day) },
  span(s),
).filter(x => x != none).join(" · ")

// The bar heading a group's table: its name, and its Events' title when they share one.
#let bar-cell(name, shared, cols) = table.cell(colspan: cols, fill: pri, inset: (x: 8pt, y: 5pt), stroke: none, {
  text(size: 10.5pt, weight: "bold", fill: white, name)
  if shared != none {
    h(8pt)
    text(size: 9pt, fill: oklch(88%, 0.03, 255deg), shared)
  }
})
#let shared-title(events) = {
  let titles = events.map(ev => ev.title).dedup()
  if titles.len() == 1 { titles.first() } else { none }
}
#let panel(columns, header, cells) = {
  v(8pt)
  block(stroke: 0.75pt + bd, radius: 7pt, clip: true, width: 100%, fill: white,
    table(columns: columns, inset: (x: 6pt, y: 4pt), stroke: none, header, ..cells))
}

// The list table: Data · Evento · Horário · Setor · Quem serve, one Event after another.
#let list-table(part, events, bar) = {
  let sectors = part.singleSector == none
  let cols = if sectors { 5 } else { 4 }
  let rows-of(b) = if b.cancelled or b.shifts.len() == 0 { 1 } else { b.shifts.map(s => s.sectors.len()).sum() }
  let cells = ()
  for (ei, ev) in events.enumerate() {
    // A thick line between Events, a quiet one inside them.
    let edge = if ei == 0 { none } else { edge }
    let when = if ev.startDay == ev.endDay { day(ev.startDay) } else { [#day(ev.startDay) –#linebreak()#day(ev.endDay)] }
    let date-cell(rowspan) = table.cell(rowspan: rowspan, stroke: (top: edge, right: 0.75pt + bd), text(weight: "bold", when))
    if ev.cancelled {
      cells.push(date-cell(1))
      cells.push(table.cell(stroke: (top: edge), text(weight: "bold", ev.title)))
      cells.push(table.cell(colspan: cols - 2, stroke: (top: edge), fill: des-bg, align: center + horizon, text(fill: des, weight: "bold", t.noService)))
      continue
    }
    if ev.timeBlocks.len() == 0 { continue }
    cells.push(date-cell(ev.timeBlocks.map(rows-of).sum()))
    for (bi, b) in ev.timeBlocks.enumerate() {
      let top = if bi == 0 { edge } else { quiet }
      let title = if adds(b.label, ev.title) { ev.title + " · " + b.label } else { ev.title }
      cells.push(table.cell(rowspan: rows-of(b), stroke: (top: top), text(weight: "bold", title)))
      if b.cancelled {
        cells.push(table.cell(colspan: cols - 2, stroke: (top: top), fill: des-bg, align: center + horizon, text(fill: des, weight: "bold", t.cancelled)))
        continue
      }
      if b.shifts.len() == 0 {
        cells.push(table.cell(colspan: cols - 2, stroke: (top: top), text(fill: mfg, "—")))
        continue
      }
      for (si, s) in b.shifts.enumerate() {
        let shift-top = if si == 0 { top } else { quiet }
        for (ri, sec) in s.sectors.enumerate() {
          let row-top = if ri == 0 { shift-top } else { quiet }
          if ri == 0 {
            cells.push(table.cell(rowspan: s.sectors.len(), stroke: (top: row-top, left: 0.75pt + bd), fill: acc, text(weight: "bold", fill: pri, shift-when(s))))
          }
          if sectors {
            cells.push(table.cell(stroke: (top: row-top), sector-label(sec)))
          }
          cells.push(table.cell(stroke: (top: row-top), people(part, sec)))
        }
      }
    }
  }
  let labels = (t.columns.date, t.columns.event, t.columns.time) + (if sectors { (t.columns.sector,) } else { () }) + (t.columns.people,)
  let header = table.header(repeat: true,
    ..(if bar != none { (bar-cell(bar.name, none, cols),) } else { () }),
    ..labels.map(label => table.cell(fill: acc, stroke: (bottom: 0.75pt + bd), text(size: 8pt, weight: "bold", fill: mfg, label))),
  )
  panel((78pt, 125pt, 135pt) + (if sectors { (96pt,) } else { () }) + (1fr,), header, cells)
}

// A group's grid needs every live Event to repeat the same blocks and Shifts.
// Per block, its reference Shifts and their Sectors, or none when no
// Event of the group holds it live; none overall when the shapes differ.
#let shift-key(s) = (s.label, s.day, s.startTime, s.endTime)
#let grid-rows(events) = {
  let live = events.filter(ev => not ev.cancelled)
  if live.len() == 0 { return none }
  let labels(ev) = ev.timeBlocks.map(b => b.label)
  if live.any(ev => labels(ev) != labels(live.first())) { return none }
  let blocks = ()
  for (bi, label) in labels(live.first()).enumerate() {
    let held = live.map(ev => ev.timeBlocks.at(bi)).filter(b => not b.cancelled and b.shifts.len() > 0)
    if held.len() == 0 {
      blocks.push((label: label, shifts: none))
      continue
    }
    let keys = held.first().shifts.map(shift-key)
    if held.any(b => b.shifts.map(shift-key) != keys) { return none }
    let shifts = held.first().shifts.enumerate().map(((si, s)) => {
      let sectors = held.map(b => b.shifts.at(si).sectors).flatten()
        .map(sec => (name: sec.name, paletteIndex: sec.paletteIndex))
        .dedup(key: sec => sec.name)
        .sorted(key: sec => sec.paletteIndex)
      (shift: s, sectors: sectors)
    })
    blocks.push((label: label, shifts: shifts))
  }
  blocks
}

// One group as a grid: a time band per Shift spanning its Sector rows, the
// dates as columns. A cancelled Event fills its column, a cancelled block its rows.
#let group-grid(part, events, blocks, bar) = {
  let sectors = part.singleSector == none
  let rows-of(b) = if b.shifts == none { 1 } else { b.shifts.map(s => calc.max(1, s.sectors.len())).sum() }
  let total = blocks.map(rows-of).sum()
  for chunk in events.chunks(max-date-columns) {
    let lead = if sectors { 2 } else { 1 }
    let cols = lead + chunk.len()
    let cells = ()
    let row = 0
    for (bi, b) in blocks.enumerate() {
      let top = if bi == 0 { none } else { edge }
      let band-rows = if b.shifts == none { ((label: b.label, sectors: ()),) } else {
        b.shifts.map(s => (label: (if b.label != none { b.label + linebreak() }) + shift-when(s.shift), shift: s.shift, sectors: s.sectors))
      }
      for (si, band) in band-rows.enumerate() {
        let band-top = if si == 0 { top } else { quiet }
        let sector-rows = if band.sectors.len() == 0 { (none,) } else { band.sectors }
        for (ri, sec) in sector-rows.enumerate() {
          let row-top = if ri == 0 { band-top } else { quiet }
          if ri == 0 {
            cells.push(table.cell(rowspan: sector-rows.len(), stroke: (top: row-top), fill: acc, text(weight: "bold", fill: pri, if band.label == none { "—" } else { band.label })))
          }
          if sectors {
            cells.push(table.cell(stroke: (top: row-top, left: 0.75pt + bd), if sec != none { sector-label(sec) }))
          }
          for ev in chunk {
            if ev.cancelled {
              if row == 0 {
                cells.push(table.cell(rowspan: total, stroke: (left: 0.75pt + bd), fill: des-bg, align: center + horizon, text(fill: des, weight: "bold", t.noService)))
              }
              continue
            }
            let eb = ev.timeBlocks.at(bi)
            if eb.cancelled or b.shifts == none {
              if si == 0 and ri == 0 {
                let cell-text = if eb.cancelled { t.cancelled } else { "—" }
                cells.push(table.cell(rowspan: rows-of(b), stroke: (top: top, left: 0.75pt + bd), fill: if eb.cancelled { des-bg }, align: center + horizon, text(fill: if eb.cancelled { des } else { mfg }, weight: "bold", cell-text)))
              }
              continue
            }
            let mine = if eb.shifts.len() == 0 or sec == none { () } else { eb.shifts.at(si).sectors.filter(x => x.name == sec.name) }
            cells.push(table.cell(stroke: (top: row-top, left: 0.75pt + bd),
              if mine.len() == 0 { text(fill: mfg, "—") } else { people(part, mine.first()) }))
          }
          row += 1
        }
      }
    }
    let shared = shared-title(events)
    let date-head(ev) = {
      let parts = day(ev.startDay).split(" ")
      text(size: 7.5pt, weight: "bold", fill: mfg, parts.first())
      linebreak()
      text(size: 10pt, weight: "bold", parts.slice(1).join(" "))
      if shared == none {
        linebreak()
        text(size: 7.5pt, fill: mfg, ev.title)
      }
    }
    let head-cell(body) = table.cell(fill: acc, stroke: (bottom: 0.75pt + bd, left: 0.75pt + bd), body)
    let header = table.header(repeat: true,
      bar-cell(bar.name, shared, cols),
      table.cell(fill: acc, stroke: (bottom: 0.75pt + bd), []),
      ..(if sectors { (head-cell([]),) } else { () }),
      ..chunk.map(ev => head-cell(date-head(ev))),
    )
    panel((92pt,) + (if sectors { (86pt,) } else { () }) + (1fr,) * chunk.len(), header, cells)
  }
}

#for part in data.parts {
  for group in part.groups {
    if group.kind == "list" {
      list-table(part, group.events, none)
      continue
    }
    let bar = (name: if group.name == none { t.catchAll } else { group.name })
    let blocks = if group.kind == "group" { grid-rows(group.events) } else { none }
    if blocks == none {
      list-table(part, group.events, bar)
    } else {
      group-grid(part, group.events, blocks, bar)
    }
  }
}
