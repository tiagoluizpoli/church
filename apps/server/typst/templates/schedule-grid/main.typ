// Schedule export, Grid template (#1243): the A4 landscape PDF table.
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

#for part in data.parts {
  let sectors = part.singleSector == none
  let cols = if sectors { 5 } else { 4 }
  let rows-of(b) = if b.cancelled or b.shifts.len() == 0 { 1 } else { b.shifts.map(s => s.sectors.len()).sum() }
  let cells = ()
  for (ei, ev) in part.events.enumerate() {
    // A thick line between Events, a quiet one inside them.
    let edge = if ei == 0 { none } else { 1.2pt + pri }
    let quiet = 0.5pt + mut
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
        let when = (
          if s.label != none { s.label },
          if s.day != none { day(s.day) },
          span(s),
        ).filter(x => x != none).join(" · ")
        for (ri, sec) in s.sectors.enumerate() {
          let row-top = if ri == 0 { shift-top } else { quiet }
          if ri == 0 {
            cells.push(table.cell(rowspan: s.sectors.len(), stroke: (top: row-top, left: 0.75pt + bd), fill: acc, text(weight: "bold", fill: pri, when)))
          }
          if sectors {
            cells.push(table.cell(stroke: (top: row-top), text(weight: "bold", fill: palette.at(calc.rem(sec.paletteIndex, palette.len())), {
              swatch(sec.paletteIndex)
              h(3pt)
              sec.name
            })))
          }
          let names = sec.people.map(p => {
            let name = if p.name == none { text(fill: mfg, t.emptySpot) } else { p.name }
            if part.singleRole == none { name + " (" + p.role + ")" } else { name }
          })
          cells.push(table.cell(stroke: (top: row-top), names.join(linebreak())))
        }
      }
    }
  }

  let labels = (t.columns.date, t.columns.event, t.columns.time) + (if sectors { (t.columns.sector,) } else { () }) + (t.columns.people,)
  v(8pt)
  block(stroke: 0.75pt + bd, radius: 7pt, clip: true, width: 100%, fill: white,
    table(
      columns: (78pt, 125pt, 135pt) + (if sectors { (96pt,) } else { () }) + (1fr,),
      inset: (x: 6pt, y: 4pt),
      stroke: none,
      table.header(repeat: true,
        ..labels.map(label => table.cell(fill: acc, stroke: (bottom: 0.75pt + bd), text(size: 8pt, weight: "bold", fill: mfg, label))),
      ),
      ..cells,
    ))
}
