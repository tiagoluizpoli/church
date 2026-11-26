// Throwaway Typst version of prototype variant E (grid). Reads data.json.
// typst compile --font-path fonts --ignore-system-fonts [--input data=data-long.json] schedule.typ out/typst.pdf
// the server passes the Schedule as a JSON string input (no temp file); the CLI reads a file
#let d = if "payload" in sys.inputs { json(bytes(sys.inputs.payload)) } else { json(sys.inputs.at("data", default: "data.json")) }
#let fg = oklch(28.6%, 0.032, 254deg)
#let mfg = oklch(48%, 0.024, 250deg)
#let bd = oklch(88.5%, 0.012, 242deg)
#let mut = oklch(95.5%, 0.008, 236deg)
#let acc = oklch(94.8%, 0.018, 247deg)
#let pri = oklch(37.8%, 0.09, 255deg)
#let des = oklch(56%, 0.207, 26deg)
#let sec = (oklch(45%, 0.13, 255deg), oklch(50%, 0.1, 190deg), oklch(50%, 0.12, 145deg), oklch(50%, 0.13, 300deg))

#set document(title: d.ministry + " · " + d.period)
#set page(paper: "a4", flipped: true, margin: (x: 12mm, top: 11mm, bottom: 10mm), fill: oklch(99.2%, 0.002, 220deg))
#set text(font: "Atkinson Hyperlegible", size: 9pt, fill: fg, lang: "pt", region: "BR")
#set par(leading: 0.45em)

// header
#grid(columns: (auto, 1fr, auto), column-gutter: 10pt, align: horizon,
  box(image("logo.png", width: 33pt), radius: 7pt, clip: true),
  [#text(size: 8pt, weight: "bold", tracking: 0.08em, fill: mfg, upper(d.kicker)) \ #text(size: 16.5pt, weight: "bold", d.ministry)],
  align(right)[#text(size: 11pt, weight: "bold", d.period) \ #text(size: 9.5pt, fill: mfg, d.range)],
)
#v(-2pt)
#line(length: 100%, stroke: 0.75pt + bd)

// never split a row; a band (time + its Sector rows) stays on one page
#set table.cell(breakable: false)
#let dot(c) = box(width: 5pt, height: 5pt, radius: 1.5pt, fill: c, baseline: -0.5pt)

#for g in d.groups {
  v(8pt)
  // group title stays with the table start
  block(breakable: false, sticky: true, width: 100%, fill: pri, inset: (x: 9pt, y: 5pt), radius: (top: 7pt), below: 0pt,
    text(fill: white)[#text(size: 11pt, weight: "bold", g.name) #h(6pt) #text(size: 9pt, g.subtitle)])
  let n = g.cols.len()
  let cells = ()
  for (bi, b) in g.bands.enumerate() {
    for (si, r) in b.rows.enumerate() {
      let top = if si == 0 and bi > 0 { 1.5pt + pri } else if si > 0 { 0.75pt + mut } else { none }
      if si == 0 {
        cells.push(table.cell(rowspan: b.rows.len(), fill: pri, align: center + horizon, stroke: (top: if bi > 0 { 1.5pt + white } else { none }),
          rotate(-90deg, reflow: true, text(fill: white, weight: "bold", size: 10pt, b.time))))
      }
      cells.push(table.cell(stroke: (top: top, right: 0.75pt + bd), text(fill: sec.at(r.color), weight: "bold", size: 8.5pt)[#dot(sec.at(r.color)) #h(2pt) #r.sector]))
      for (ci, c) in r.cells.enumerate() {
        if c == none { continue }
        let lr = (right: if ci < n - 1 { 0.75pt + bd } else { none })
        if "cancelled" in c {
          cells.push(table.cell(rowspan: c.rowspan, fill: oklch(97%, 0.015, 26deg), align: center + horizon, stroke: (top: top, ..lr),
            text(fill: des, weight: "bold", c.cancelled)))
        } else {
          cells.push(table.cell(stroke: (top: top, ..lr), c.names.join(linebreak())))
        }
      }
    }
  }
  block(stroke: 0.75pt + bd, radius: (bottom: 7pt), clip: true, above: 0pt, width: 100%, fill: white,
    table(
      columns: (22pt, 68pt) + (1fr,) * n,
      inset: (x: 6pt, y: 3.5pt),
      stroke: none,
      table.header(repeat: true,
        table.cell(fill: acc, stroke: (bottom: 0.75pt + bd), []),
        table.cell(fill: acc, stroke: (bottom: 0.75pt + bd, right: 0.75pt + bd), []),
        ..g.cols.enumerate().map(((i, c)) => table.cell(fill: acc, stroke: (bottom: 0.75pt + bd, right: if i < n - 1 { 0.75pt + bd } else { none }),
          [#text(size: 7.5pt, weight: "bold", tracking: 0.06em, fill: mfg, upper(c.wd)) \ #text(size: 10.5pt, weight: "bold", c.dn)])),
      ),
      ..cells,
    ))
}
